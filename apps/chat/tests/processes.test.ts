// BA processes (spec 022 M5, FR-004, FR-005, FR-007): every change is a revision, a stale base is
// refused and nothing is overwritten, drafts are per person, Discard keeps the last revision,
// Restore adds one, a dismissed grouping is never suggested again. Over the real HTTP routes.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
   -- the routes' JSON answers are read loosely; their shapes are what the assertions check. */
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi, listenLocal } from '../src/api.js';
import { createProcessService } from '../src/process-service.js';
import { testService } from './helpers.js';

const P = 'reference-insurer';
const T = '2026-10-14T08:00:00.000Z';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('BA processes', () => {
  let t: ReturnType<typeof testService>;
  let server: Server;
  let base: string;

  beforeEach(async () => {
    t = testService();
    const raw = t.opened.raw;
    raw
      .prepare(
        `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, status, started_at)
         VALUES ('run-1', ?, 'guest', 'map', 'sandbox', '2026-10-14', '1366x768', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
      )
      .run(P, T);
    for (const [id, route] of [
      ['s-home', '/'],
      ['s-car', '/samochod'],
      ['s-driver', '/kalkulator/kierowca'],
      ['s-options', '/kalkulator/opcje'],
    ] as const)
      raw
        .prepare(
          `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence, stabilization, first_seen_run, created_at)
           VALUES (?, ?, ?, 'c', ?, ?, 'ev', 'observed', 'settled', 'run-1', ?)`,
        )
        .run(id, P, `fp-${id}`, route, `Title ${route}`, T);
    server = createApi({
      service: t.service,
      logError: () => Promise.resolve({ ref: 'ERR-T', logged: true }),
      findError: () => Promise.resolve(null),
      version: 'test',
      processes: createProcessService({ db: t.opened.db }),
    });
    base = `http://127.0.0.1:${String(await listenLocal(server, 0))}`;
  });

  afterEach(async () => {
    server.close();
    t.service.close();
    await t.opened.close();
  });

  const call = async (method: string, path: string, body?: Json) => {
    const res = await fetch(`${base}/portals/${P}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Json };
  };
  const steps = (modelId: string, rev: number) =>
    JSON.parse(
      (
        t.opened.raw
          .prepare('SELECT steps FROM process_model_revisions WHERE model_id = ? AND rev = ?')
          .get(modelId, rev) as { steps: string }
      ).steps,
    ) as Json[];

  const newProcess = async () => {
    const r = await call('POST', '/processes', {
      name: 'Oblicz składkę',
      persona: 'guest',
      state_ids: ['s-home', 's-car', 's-driver', 's-options'],
      author: 'Anna',
    });
    expect(r.status).toBe(201);
    return r.body;
  };

  it('creates PRC-001 with an observed as-is A r1 and branches B r1 from it', async () => {
    const made = await newProcess();
    expect(made.process).toMatchObject({ key: 'PRC-001', stage: 'scoped', rev: 1, source: 'new' });
    expect(made.model).toMatchObject({ label: 'A', kind: 'as_is', rev: 1 });
    expect(made.revision.steps.map((s: Json) => [s.id, s.state_id, s.observed])).toEqual([
      ['s1', 's-home', true],
      ['s2', 's-car', true],
      ['s3', 's-driver', true],
      ['s4', 's-options', true],
    ]);
    const b = await call('POST', `/processes/${made.process.id}/models`, { author: 'Anna' });
    expect(b.status).toBe(201);
    expect(b.body.model).toMatchObject({ label: 'B', kind: 'to_be', branched_from_rev: 1 });
    expect(b.body.revision.steps.map((s: Json) => s.from)).toEqual([
      ['s1'],
      ['s2'],
      ['s3'],
      ['s4'],
    ]);
  });

  it('saves a draft as B r2; a second person on the old base gets 409, keeps the draft, rebases', async () => {
    const id = (await newProcess()).process.id;
    const b = (await call('POST', `/processes/${id}/models`, { author: 'Anna' })).body;
    const drawn = [
      b.revision.steps[0],
      {
        id: 'm1',
        title: 'One form',
        route: '/oc-ac/wycena',
        state_id: null,
        screen_id: null,
        observed: false,
        from: ['s3', 's4'],
        annotations: [{ text: 'Driver and options together', author: 'Anna', at: T }],
      },
      {
        id: 'n1',
        title: 'Summary',
        route: '/oc-ac/oferta',
        state_id: null,
        screen_id: null,
        observed: false,
        from: [],
        annotations: [],
      },
    ];
    const anna = await call('PUT', `/processes/${id}/models/B/draft`, {
      base_rev: 1,
      steps: drawn,
      author: 'Anna',
    });
    expect(anna.status).toBe(200);
    const bob = await call('PUT', `/processes/${id}/models/B/draft`, {
      base_rev: 1,
      steps: drawn.slice(0, 2),
      author: 'Bob',
    });
    expect(bob.status).toBe(200);

    const saved = await call('POST', `/processes/${id}/models/B/save`, {
      base_rev: 1,
      author: 'Anna',
      note: 'Merged two steps',
    });
    expect(saved.status).toBe(201);
    expect(saved.body.model.rev).toBe(2);
    expect(steps(b.model.id, 2).map((s) => s.id)).toEqual(['s1', 'm1', 'n1']);
    expect(steps(b.model.id, 1)).toHaveLength(4); // r1 untouched

    const late = await call('POST', `/processes/${id}/models/B/save`, {
      base_rev: 1,
      author: 'Bob',
    });
    expect(late.status).toBe(409);
    expect(late.body).toMatchObject({ code: 'STALE_REVISION' });
    const kept = t.opened.raw
      .prepare("SELECT base_rev FROM process_drafts WHERE author = 'Bob'")
      .get() as Json;
    expect(kept.base_rev).toBe(1);
    const rebased = await call('POST', `/processes/${id}/models/B/rebase`, { author: 'Bob' });
    expect(rebased.body.base_rev).toBe(2);
    const bobSaved = await call('POST', `/processes/${id}/models/B/save`, {
      base_rev: 2,
      author: 'Bob',
    });
    expect(bobSaved.body.model.rev).toBe(3);

    const restored = await call('POST', `/processes/${id}/models/B/restore`, {
      rev: 2,
      base_rev: 3,
      author: 'Anna',
    });
    expect(restored.status).toBe(201);
    expect(restored.body.revision).toMatchObject({ rev: 4, change: 'restore', restored_from: 2 });
    expect(steps(b.model.id, 4)).toEqual(steps(b.model.id, 2));
  });

  it('refuses invalid steps, drawing on the as-is, and discards a draft leaving the revision', async () => {
    const id = (await newProcess()).process.id;
    const b = (await call('POST', `/processes/${id}/models`, { author: 'Anna' })).body;
    const bad = await call('PUT', `/processes/${id}/models/B/draft`, {
      base_rev: 1,
      author: 'Anna',
      steps: [
        {
          id: 'x',
          title: 'x',
          route: '/x',
          state_id: 's-none',
          screen_id: null,
          observed: true,
          from: ['s9'],
          annotations: [],
        },
      ],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toContain('names no recorded screen');
    expect(bad.body.message).toContain('comes from s9');
    const asIs = await call('PUT', `/processes/${id}/models/A/draft`, {
      base_rev: 1,
      steps: b.revision.steps,
      author: 'Anna',
    });
    expect(asIs.status).toBe(409);
    await call('PUT', `/processes/${id}/models/B/draft`, {
      base_rev: 1,
      steps: b.revision.steps.slice(0, 1),
      author: 'Anna',
    });
    const gone = await call('DELETE', `/processes/${id}/models/B/draft`, { author: 'Anna' });
    expect(gone.body).toEqual({ discarded: true });
    expect(steps(b.model.id, 1)).toHaveLength(4);
  });

  it('renames with a base check, marks a model live per environment, keeps change spec revisions', async () => {
    const id = (await newProcess()).process.id;
    const renamed = await call('POST', `/processes/${id}`, {
      name: 'Quote OC/AC',
      base_rev: 1,
      author: 'Anna',
    });
    expect(renamed.body).toMatchObject({ name: 'Quote OC/AC', rev: 2 });
    expect(
      (await call('POST', `/processes/${id}`, { stage: 'to_be_design', base_rev: 1 })).status,
    ).toBe(409);
    await call('POST', `/processes/${id}/models`, { author: 'Anna' });
    const live = await call('POST', `/processes/${id}/live`, {
      environment: 'sandbox',
      label: 'B',
      author: 'Anna',
      reason: 'deployed',
    });
    expect(live.status).toBe(201);
    expect(live.body).toMatchObject({ label: 'B', model_rev: 1, environment: 'sandbox' });
    const spec = {
      left: { label: 'A', rev: 1 },
      right: { label: 'B', rev: 1 },
      sections: {
        scope: 'Quote',
        as_is: 'A r1',
        to_be: 'B r1',
        delta: ['Merge two steps'],
        records: [],
        migration_cut: 'none',
        open_questions: [],
      },
      author: 'Anna',
    };
    const s1 = await call('POST', `/processes/${id}/change-spec`, spec);
    expect(s1.body).toMatchObject({ rev: 1, base_rev: null });
    expect((await call('POST', `/processes/${id}/change-spec`, spec)).status).toBe(409);
    const s2 = await call('POST', `/processes/${id}/change-spec`, { ...spec, base_rev: 1 });
    expect(s2.body.rev).toBe(2);
  });

  it('archives and restores as revisions, keeping every row; a stage sign-off records A (spec 027)', async () => {
    const id = (await newProcess()).process.id;
    const signed = await call('POST', `/processes/${id}`, {
      stage: 'as_is_documented',
      base_rev: 1,
      author: 'Anna',
    });
    expect(signed.body).toMatchObject({ stage: 'as_is_documented', rev: 2, archived_at: null });
    const archived = await call('POST', `/processes/${id}/archive`, {
      base_rev: 2,
      author: 'Anna',
    });
    expect(archived.status).toBe(200);
    expect(archived.body.archived_at).toEqual(expect.any(String));
    expect(
      (await call('POST', `/processes/${id}/archive`, { base_rev: 3, author: 'Anna' })).body,
    ).toMatchObject({ code: 'UNCHANGED' });
    expect(
      (await call('POST', `/processes/${id}/unarchive`, { base_rev: 2, author: 'Anna' })).status,
    ).toBe(409); // stale base
    const back = await call('POST', `/processes/${id}/unarchive`, { base_rev: 3, author: 'Anna' });
    expect(back.body).toMatchObject({ rev: 4, archived_at: null, stage: 'as_is_documented' });
    const revs = t.opened.raw
      .prepare(
        'SELECT rev, change, as_is_rev FROM ba_process_revisions WHERE process_id = ? ORDER BY rev',
      )
      .all(id);
    expect(revs).toEqual([
      { rev: 1, change: 'create', as_is_rev: null },
      { rev: 2, change: 'stage', as_is_rev: 1 },
      { rev: 3, change: 'archive', as_is_rev: null },
      { rev: 4, change: 'unarchive', as_is_rev: null },
    ]);
  });

  it('edits A: removed, added and reordered screens as one A revision; kept steps keep their id (spec 027)', async () => {
    const made = await newProcess();
    const id = made.process.id;
    const a = made.model.id;
    const edit = (state_ids: string[], base_rev: number) =>
      call('POST', `/processes/${id}/models/A/edit`, { state_ids, base_rev, author: 'Anna' });
    const r2 = await edit(['s-home', 's-driver', 's-car'], 1);
    expect(r2.status).toBe(201);
    expect(r2.body.revision).toMatchObject({
      rev: 2,
      change: 'edit',
      author: 'Anna',
      note: 'Removed 1 step, changed the order',
    });
    expect(steps(a, 2).map((s) => [s.id, s.state_id])).toEqual([
      ['s1', 's-home'],
      ['s3', 's-driver'],
      ['s2', 's-car'],
    ]);
    const r3 = await edit(['s-home', 's-driver', 's-car', 's-options'], 2);
    expect(r3.body.revision.note).toBe('Added 1 screen');
    expect(steps(a, 3).at(-1)).toMatchObject({ id: 's5', state_id: 's-options', observed: true });
    expect((await edit(['s-home', 's-driver', 's-car', 's-options'], 3)).body).toMatchObject({
      code: 'UNCHANGED',
    });
    expect((await edit(['s-home'], 2)).status).toBe(409); // stale base
    expect((await edit(['s-nowhere'], 3)).status).toBe(404);
    await call('POST', `/processes/${id}/models`, { author: 'Anna' });
    expect(
      (
        await call('POST', `/processes/${id}/models/B/edit`, {
          state_ids: ['s-home'],
          base_rev: 1,
          author: 'Anna',
        })
      ).status,
    ).toBe(409); // a to-be changes in a draft
  });

  it('suggestions: accept makes a process, dismiss is final for that set of screens', async () => {
    const svc = createProcessService({ db: t.opened.db });
    const one = await svc.suggest(P, null, {
      name: 'Compare',
      persona: 'guest',
      state_ids: ['s-home', 's-car'],
      why: 'menu link "Samochód"',
    });
    await expect(
      svc.suggest(P, null, {
        name: 'Again',
        persona: 'guest',
        state_ids: ['s-car', 's-home'],
        why: 'x',
      }),
    ).rejects.toMatchObject({ extra: { code: 'DUPLICATE' } });
    const dismissed = await call('POST', `/suggestions/${one.id}/dismiss`, { author: 'Anna' });
    expect(dismissed.body).toMatchObject({ status: 'dismissed', decided_by: 'Anna' });
    await expect(
      svc.suggest(P, null, {
        name: 'Again',
        persona: 'guest',
        state_ids: ['s-car', 's-home'],
        why: 'x',
      }),
    ).rejects.toMatchObject({ extra: { code: 'DISMISSED' } });
    const two = await svc.suggest(P, null, {
      name: 'Quote',
      persona: 'guest',
      state_ids: ['s-driver', 's-options'],
      why: 'form continues',
    });
    const accepted = await call('POST', `/suggestions/${two.id}/accept`, { author: 'Anna' });
    expect(accepted.status).toBe(201);
    expect(accepted.body.process).toMatchObject({
      key: 'PRC-001',
      name: 'Quote',
      source: 'suggestion',
      suggestion_id: two.id,
    });
    expect((await call('POST', `/suggestions/${two.id}/accept`, { author: 'Anna' })).status).toBe(
      409,
    );
    expect((await call('GET', `/suggestions/${two.id}/accept`)).status).toBe(405);
  });
});
