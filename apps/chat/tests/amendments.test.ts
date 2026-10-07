import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEvidenceStore, type EvidenceStore } from '@pathfinder/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAmendmentService } from '../src/amendments.js';
import { createApi, listenLocal } from '../src/api.js';
import { logError } from '../src/error-log.js';
import { testService } from './helpers.js';

const P = 'reference-insurer';
const T = '2026-10-06T08:00:00.000Z';

const layout = {
  version: 1,
  viewport: { width: 1366, height: 768 },
  page: { width: 1366, height: 900 },
  cut: false,
  elements: [
    { key: 'heading "Oferta"', role: 'heading', name: 'Oferta', box: null },
    { key: 'button "Wstecz"', role: 'button', name: 'Wstecz', box: null },
    { key: 'button "Kup polisę"', role: 'button', name: 'Kup polisę', box: null },
  ],
};

describe('amendment commands', () => {
  let t: ReturnType<typeof testService>;
  let dir: string;
  let evidence: EvidenceStore;
  let server: Server;
  let base: string;

  beforeEach(async () => {
    t = testService();
    dir = await mkdtemp(join(tmpdir(), 'chat-amd-'));
    evidence = createEvidenceStore(dir);
    const layoutRef = await evidence.storeJson(layout);
    const run = t.opened.raw.prepare(
      `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, status, started_at)
       VALUES ('run-1', ?, 'guest', 'map', 'sandbox', '2026-10-06', '1366x768', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
    );
    run.run(P, T);
    const state = t.opened.raw.prepare(
      `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence, stabilization, first_seen_run, created_at, layout_ref)
       VALUES (?, ?, ?, 'c', ?, ?, 'ev', 'observed', 'settled', 'run-1', ?, ?)`,
    );
    state.run('s-offer', P, 'fp-offer', '/oferta', 'Oferta', T, layoutRef);
    state.run('s-bare', P, 'fp-bare', '/bare', 'Bare', T, null);
    state.run('s-other', 'other-portal', 'fp-other', '/x', 'X', T, layoutRef);
    server = createApi({
      service: t.service,
      logError: (input) => logError(input, { logsDir: join(dir, 'logs') }),
      findError: () => Promise.resolve(null),
      version: 'test',
      amendments: createAmendmentService({ db: t.opened.db, evidence }),
    });
    base = `http://127.0.0.1:${String(await listenLocal(server, 0))}`;
  });
  afterEach(async () => {
    server.close();
    t.service.close();
    await t.opened.close();
    await rm(dir, { recursive: true, force: true });
  });

  const post = (body: unknown, portal = P) =>
    fetch(`${base}/portals/${portal}/amendments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('creates a note on a state with the anchor of that state and AMD keys in order', async () => {
    const res = await post({ kind: 'note', target_kind: 'state', target_id: 's-offer', text: 'x' });
    expect(res.status).toBe(201);
    const first = (await res.json()) as Record<string, unknown>;
    expect(first).toMatchObject({
      key: 'AMD-001',
      status: 'active',
      author: 'BA',
      anchor_fingerprint: 'fp-offer',
      anchor_route_template: '/oferta',
      anchor_element: null,
      attachment_sha256: null,
    });
    const second = (await (
      await post({
        kind: 'note',
        target_kind: 'state',
        target_id: 's-offer',
        text: 'y',
        author: 'Ola',
      })
    ).json()) as Record<string, unknown>;
    expect(second).toMatchObject({ key: 'AMD-002', author: 'Ola' });
    const rows = t.opened.raw.prepare('SELECT key, anchor_element FROM amendments').all();
    expect(rows).toHaveLength(2);
  });

  it('numbers keys per portal', async () => {
    await post({ kind: 'note', target_kind: 'state', target_id: 's-offer', text: 'a' });
    const other = await post(
      { kind: 'note', target_kind: 'state', target_id: 's-other', text: 'b' },
      'other-portal',
    );
    expect(((await other.json()) as { key: string }).key).toBe('AMD-001');
  });

  it('anchors an element reference with role and role index', async () => {
    const res = await post({
      kind: 'element_ref',
      target_kind: 'wireframe_element',
      target_id: 's-offer#button "Kup polisę"',
      text: 'Add a consent line',
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      anchor_fingerprint: 'fp-offer',
      anchor_route_template: '/oferta',
      anchor_element: {
        key: 'button "Kup polisę"',
        role: 'button',
        name: 'Kup polisę',
        roleIndex: 1,
      },
    });
    const stored = t.opened.raw.prepare('SELECT anchor_element FROM amendments').get() as {
      anchor_element: string;
    };
    expect(JSON.parse(stored.anchor_element)).toMatchObject({ roleIndex: 1 });
  });

  it('refuses targets that do not resolve', async () => {
    const cases: [unknown, number][] = [
      [{ kind: 'note', target_kind: 'state', target_id: 'nope', text: 'x' }, 404],
      [{ kind: 'note', target_kind: 'state', target_id: 's-other', text: 'x' }, 404],
      [
        { kind: 'note', target_kind: 'evidence', target_id: `${'a'.repeat(64)}.png`, text: 'x' },
        404,
      ],
      [{ kind: 'note', target_kind: 'evidence', target_id: '../etc/passwd', text: 'x' }, 404],
      [{ kind: 'note', target_kind: 'wireframe_element', target_id: 's-offer', text: 'x' }, 400],
      [
        {
          kind: 'note',
          target_kind: 'wireframe_element',
          target_id: 's-offer#button "No"',
          text: 'x',
        },
        404,
      ],
      [
        {
          kind: 'note',
          target_kind: 'wireframe_element',
          target_id: 's-bare#button "A"',
          text: 'x',
        },
        409,
      ],
      [{ kind: 'element_ref', target_kind: 'state', target_id: 's-offer', text: 'x' }, 400],
      [{ kind: 'note', target_kind: 'state', target_id: 's-offer' }, 400],
      [{ kind: 'attachment', target_kind: 'state', target_id: 's-offer' }, 400],
    ];
    for (const [body, status] of cases)
      expect((await post(body)).status, JSON.stringify(body)).toBe(status);
    expect(t.opened.raw.prepare('SELECT count(*) AS n FROM amendments').get()).toEqual({ n: 0 });
  });

  it('accepts evidence that exists in the store', async () => {
    const ref = await evidence.storeText('proof', 'txt');
    const res = await post({ kind: 'note', target_kind: 'evidence', target_id: ref, text: 'see' });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ anchor_fingerprint: null, anchor_element: null });
  });

  it('stores an attachment in the evidence store by sha256', async () => {
    const content = Buffer.from('%PDF-1.4 fake');
    const res = await post({
      kind: 'attachment',
      target_kind: 'state',
      target_id: 's-offer',
      attachment: { name: 'Spec.PDF', content_base64: content.toString('base64') },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { attachment_sha256: string; attachment_name: string };
    expect(body.attachment_name).toBe('Spec.PDF');
    expect(await readFile(join(dir, `${body.attachment_sha256}.pdf`))).toEqual(content);
  });

  it('withdraws an active amendment once', async () => {
    const created = (await (
      await post({ kind: 'note', target_kind: 'state', target_id: 's-offer', text: 'x' })
    ).json()) as { id: string };
    const url = `${base}/portals/${P}/amendments/${created.id}`;
    const res = await fetch(url, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; withdrawn_at: string };
    expect(body.status).toBe('withdrawn');
    expect(body.withdrawn_at).toMatch(/^\d{4}-/);
    const row = t.opened.raw.prepare('SELECT status, withdrawn_at FROM amendments').get();
    expect(row).toMatchObject({ status: 'withdrawn' });
    expect((await fetch(url, { method: 'DELETE' })).status).toBe(409);
    expect(
      (await fetch(`${base}/portals/${P}/amendments/missing`, { method: 'DELETE' })).status,
    ).toBe(404);
    expect(
      (await fetch(`${base}/portals/other-portal/amendments/${created.id}`, { method: 'DELETE' }))
        .status,
    ).toBe(404);
  });

  describe('superseded amendments (T033, FR-022)', () => {
    async function superseded(): Promise<string> {
      const created = (await (
        await post({
          kind: 'note',
          target_kind: 'state',
          target_id: 's-offer',
          text: 'Make it green',
        })
      ).json()) as { id: string };
      t.opened.raw
        .prepare(
          `UPDATE amendments SET status = 'superseded', superseded_reason = 'state_replaced',
             superseded_detail = 'changed', superseded_by_run = 'run-1', superseded_at = ? WHERE id = ?`,
        )
        .run(T, created.id);
      return created.id;
    }
    const action = (id: string, what: 'reapply' | 'dismiss', body: unknown = {}) =>
      fetch(`${base}/portals/${P}/amendments/${id}/${what}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    it('re-applies to a current state: a new active copy, linked both ways, original kept', async () => {
      const id = await superseded();
      const res = await action(id, 'reapply', { target_kind: 'state', target_id: 's-bare' });
      expect(res.status).toBe(201);
      const copy = (await res.json()) as Record<string, unknown>;
      expect(copy).toMatchObject({
        key: 'AMD-002',
        status: 'active',
        text: 'Make it green',
        target_id: 's-bare',
        anchor_fingerprint: 'fp-bare',
        reapplies: id,
      });
      const original = t.opened.raw
        .prepare('SELECT status, reapplied_as FROM amendments WHERE id = ?')
        .get(id);
      expect(original).toEqual({ status: 'superseded', reapplied_as: copy.id });
      expect(
        (await action(id, 'reapply', { target_kind: 'state', target_id: 's-bare' })).status,
      ).toBe(409);
      expect((await action(id, 'dismiss')).status).toBe(409);
    });

    it('dismisses once and keeps the row', async () => {
      const id = await superseded();
      const res = await action(id, 'dismiss');
      expect(res.status).toBe(200);
      expect(((await res.json()) as { status: string }).status).toBe('dismissed');
      expect((await action(id, 'dismiss')).status).toBe(409);
      expect(t.opened.raw.prepare('SELECT count(*) AS n FROM amendments').get()).toEqual({ n: 1 });
    });

    it('refuses active amendments and unknown targets', async () => {
      const active = (await (
        await post({ kind: 'note', target_kind: 'state', target_id: 's-offer', text: 'x' })
      ).json()) as { id: string };
      expect((await action(active.id, 'dismiss')).status).toBe(409);
      const id = await superseded();
      expect(
        (await action(id, 'reapply', { target_kind: 'state', target_id: 'ghost' })).status,
      ).toBe(404);
      expect((await action('nope', 'dismiss')).status).toBe(404);
    });
  });
});
