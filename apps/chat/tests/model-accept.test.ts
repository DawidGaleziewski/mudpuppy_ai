// A person accepts the screen threshold or the similarity classifier from the dashboard (spec 039
// owner answers 5 and 14): `POST /portals/{p}/model/accept`, refused plainly when not ready.
import type { Server } from 'node:http';
import { activeClassifier, activeProfile, recordClassifier } from '@mudpuppy/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi, listenLocal } from '../src/api.js';
import { testService } from './helpers.js';

const P = 'shop';

describe('model accept route', () => {
  let t: ReturnType<typeof testService>;
  let server: Server;
  let base: string;
  let flags: string[];
  const accept = (body: unknown) =>
    fetch(`${base}/portals/${P}/model/accept`, { method: 'POST', body: JSON.stringify(body) }).then(
      async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> }),
    );

  beforeEach(async () => {
    flags = [];
    t = testService();
    server = createApi({
      service: t.service,
      logError: () => Promise.resolve({ ref: 'ERR-T', logged: true }),
      findError: () => Promise.resolve(null),
      version: 'test',
      modelStore: t.opened.raw,
      addExperimentFlag: (portal, flag) => {
        flags.push(`${portal} ${flag.kind}:${flag.name}`);
        return true;
      },
    });
    base = `http://127.0.0.1:${String(await listenLocal(server, 0))}`;
  });
  afterEach(() => {
    server.close();
  });

  it('refuses τ without enough labels and accepts a classifier that beat τ', async () => {
    const tau = await accept({ what: 'tau', by: 'Anna' });
    expect(tau.status).toBe(409);
    expect(String(tau.body.message)).toContain('no calibrated τ');

    const none = await accept({ what: 'classifier', by: 'Anna' });
    expect(none.status).toBe(409);
    const profile = activeProfile(t.opened.raw, P);
    recordClassifier(
      t.opened.raw,
      P,
      profile,
      {
        ok: true,
        names: ['minhash', 'structure', 'content', 'overlay', 'calls', 'mounts', 'elements'],
        weights: [1, 1, 0, 0, 0, 0, 0],
        intercept: -1,
        labels: 40,
        held_out: 8,
        f1: 0.9,
        tau_f1: 0.7,
        better: true,
      },
      0.8,
    );
    const ok = await accept({ what: 'classifier', by: 'Anna' });
    expect(ok).toMatchObject({ status: 201, body: { classifier: { f1: 0.9, tauF1: 0.7 } } });
    expect(activeClassifier(t.opened.raw, P, profile)?.intercept).toBe(-1);
    expect((await accept({ what: 'other', by: 'Anna' })).status).toBe(400);
  });

  it('confirms or rejects findings from Review, all of a group or none', async () => {
    const raw = t.opened.raw;
    raw
      .prepare(
        `INSERT INTO model_versions (id, portal_id, seq, built_at, algorithm, threshold, stats_json)
         VALUES ('mv1', ?, 1, '2026-10-21T10:00:00.000Z', 'minhash-avglink-v1', 0.9, '{}')`,
      )
      .run(P);
    for (const [id, key] of [
      ['h1', 'H-0001'],
      ['h2', 'H-0002'],
    ] as const) {
      raw
        .prepare(
          `INSERT INTO hypotheses (id, key, portal_id, kind, claim, claim_json, claim_hash, origin,
             derived, confidence, model_version_id, created_at)
           VALUES (?, ?, ?, 'removed', 'Link gone.', '{}', ?, 'agent', 0, 'needs_confirmation',
             'mv1', '2026-10-21T10:00:00.000Z')`,
        )
        .run(id, key, P, id.repeat(32));
      raw
        .prepare(
          `INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason, at)
           VALUES (?, ?, NULL, 'proposed', 'ba-agent', 'seen missing', '2026-10-21T10:00:00.000Z')`,
        )
        .run(`e-${id}`, id);
    }
    const decide = (body: unknown) =>
      fetch(`${base}/portals/${P}/model/decide`, { method: 'POST', body: JSON.stringify(body) }).then(
        async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> }),
      );
    const unknown = await decide({ keys: ['H-0001', 'H-0404'], decision: 'confirm', by: 'Anna', reason: 'ok' });
    expect(unknown.status).toBe(409);
    const events = () =>
      raw.prepare('SELECT count(*) AS n FROM hypothesis_events').get() as { n: number };
    expect(events().n).toBe(2); // the refused key decided none of them
    const ok = await decide({ keys: ['H-0001', 'H-0002'], decision: 'reject', by: 'Anna', reason: 'still there' });
    expect(ok).toMatchObject({
      status: 201,
      body: { decided: [{ key: 'H-0001', status: 'rejected' }, { key: 'H-0002', status: 'rejected' }] },
    });
    expect((await decide({ keys: ['H-0001'], decision: 'confirm', by: 'Anna', reason: '' })).status).toBe(400);
    expect((await decide({ keys: ['H-0001'], decision: 'overturn', by: 'Anna', reason: 'x' })).status).toBe(400);
    expect(flags).toEqual([]);

    // OV-2: confirming an A/B test puts its cookie into the portal's Hints.
    raw
      .prepare(
        `INSERT INTO hypotheses (id, key, portal_id, kind, claim, claim_json, claim_hash, origin,
           rule, derived, confidence, model_version_id, created_at)
         VALUES ('h3', 'H-0003', ?, 'ab_test', 'Screen S2 shows an A/B test.', '{}', ?, 'rule',
           'R5', 0, 'needs_confirmation', 'mv1', '2026-10-21T10:00:00.000Z')`,
      )
      .run(P, 'h3'.repeat(32));
    raw
      .prepare(
        `INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason, at)
         VALUES ('e-h3', 'h3', NULL, 'proposed', 'reconciler',
           'waiting for a person (rule R5): separated by cookie:ab_calc', '2026-10-21T10:00:00.000Z')`,
      )
      .run();
    const ab = await decide({ keys: ['H-0003'], decision: 'confirm', by: 'Anna', reason: 'banner test' });
    expect(ab).toMatchObject({ status: 201, body: { hints: ['cookie ab_calc'] } });
    expect(flags).toEqual([`${P} cookie:ab_calc`]);
    // an agent's A/B claim names its cookie in claim_json
    raw
      .prepare(
        `INSERT INTO hypotheses (id, key, portal_id, kind, claim, claim_json, claim_hash, origin,
           derived, confidence, model_version_id, created_at)
         VALUES ('h4', 'H-0004', ?, 'ab_test', 'A/B on the hero.', '{"storage":"exp.hero"}', ?,
           'agent', 0, 'needs_confirmation', 'mv1', '2026-10-21T10:00:00.000Z')`,
      )
      .run(P, 'h4'.repeat(32));
    raw
      .prepare(
        `INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason, at)
         VALUES ('e-h4', 'h4', NULL, 'proposed', 'ba-agent', 'two heroes', '2026-10-21T10:00:00.000Z')`,
      )
      .run();
    await decide({ keys: ['H-0004'], decision: 'confirm', by: 'Anna', reason: 'yes' });
    expect(flags).toEqual([`${P} cookie:ab_calc`, `${P} storage:exp.hero`]);

    // Undo (spec 040 T010): the command's id comes back; one Undo reverts both keys of it.
    const post = (route: string, body: unknown) =>
      fetch(`${base}/portals/${P}/model/${route}`, { method: 'POST', body: JSON.stringify(body) }).then(
        async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> }),
      );
    const decision = ok.body['decision'] as string;
    expect(decision).toMatch(/^[0-9a-f-]{36}$/);
    const undone = await post('undo', { decision, by: 'Anna' });
    expect(undone).toMatchObject({
      status: 201,
      body: { undone: [{ key: 'H-0001', status: 'proposed' }, { key: 'H-0002', status: 'proposed' }] },
    });
    expect((await post('undo', { decision, by: 'Anna' })).status).toBe(409);
    expect((await post('undo', { decision: 'x', by: '' })).status).toBe(400);

    // Reword (T014): the sentence a person wants in the documentation.
    expect(await post('reword', { key: 'H-0003', wording: 'Banner A/B test', by: 'Anna' })).toMatchObject({
      status: 201,
      body: { reworded: { key: 'H-0003', wording: 'Banner A/B test' } },
    });
    expect((await post('reword', { key: 'H-0404', wording: 'x', by: 'Anna' })).status).toBe(409);
  });

  it('labels a pair of page versions from Same screen? (v2-14)', async () => {
    const raw = t.opened.raw;
    raw
      .prepare(
        `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, status, started_at)
         VALUES ('r1', ?, 'guest', 'map', 'sandbox', '2026-10-21', '1366x768', 'pl-PL', 'chromium', '{}', 'completed', '2026-10-21T10:00:00.000Z')`,
      )
      .run(P);
    for (const id of ['st-b', 'st-a']) {
      raw
        .prepare(
          `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence, stabilization, first_seen_run, created_at)
           VALUES (?, ?, ?, 'cl', '/wynik', 'Wynik', 'ev', 'observed', 'settled', 'r1', '2026-10-21T10:00:00.000Z')`,
        )
        .run(id, P, `fp-${id}`);
    }
    const label = (body: unknown) =>
      fetch(`${base}/portals/${P}/model/label`, { method: 'POST', body: JSON.stringify(body) }).then(
        (r) => r.status,
      );
    expect(await label({ a: 'st-b', b: 'st-a', answer: 'same_data', by: 'Anna', reason: 'price' })).toBe(201);
    const row = () =>
      raw.prepare('SELECT state_a, label, nd_kind, labelled_by, reason FROM state_pair_labels').get();
    expect(row()).toEqual({
      state_a: 'st-a',
      label: 'near_duplicate',
      nd_kind: 'dynamic_data',
      labelled_by: 'Anna',
      reason: 'price',
    });
    expect(await label({ a: 'st-a', b: 'st-b', answer: 'different', by: 'Anna' })).toBe(201);
    expect(row()).toMatchObject({ label: 'distinct', nd_kind: null, reason: null });
    expect(await label({ a: 'st-a', b: 'st-a', answer: 'same', by: 'Anna' })).toBe(409);
    expect(await label({ a: 'st-a', b: 'nope', answer: 'same', by: 'Anna' })).toBe(409);
    expect(await label({ a: 'st-a', b: 'st-b', answer: 'clone', by: 'Anna' })).toBe(400);
  });
});
