import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { journeyPath, journeyPosition, migrateUp, openDb } from '../src/index.js';

const MIGRATIONS = join(import.meta.dirname, '../../../../../data/migrations');
const H = (c: string) => c.repeat(64);
const T = (s: number) => `2026-10-25T01:00:${String(s).padStart(2, '0')}.000Z`;

/**
 * One journey of a run whose observations are numbered run-wide (an earlier journey took 1–10):
 * A, press K1 → B, a relogin landing on C, press K2 → D.
 */
function seed() {
  const o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  const r = o.raw;
  r.prepare(
    `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser,
       config_snapshot, status, started_at) VALUES ('run1', 'p', 'klient', 'map', 'sandbox', '2026-10-25',
       '1280x800', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
  ).run(T(0));
  for (const id of ['A', 'B', 'C', 'D'])
    r.prepare(
      `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence,
         stabilization, first_seen_run, created_at) VALUES (?, 'p', ?, 'c', ?, ?, ?, 'observed', 'settled', 'run1', ?)`,
    ).run(id, H(id.toLowerCase()), `/${id}`, id, `${H('e')}.yaml`, T(0));
  r.prepare(
    "INSERT INTO journeys (id, run_id, start_kind, started_at) VALUES ('j', 'run1', 'entry_url', ?)",
  ).run(T(1));
  const obs = (id: string, state: string, via: string, seq: number, at: number) =>
    r
      .prepare(
        `INSERT INTO observations (id, run_id, state_id, transition_id, via, url, hops_json, created_at, journey_id, seq,
           result, context_key, flags_json) VALUES (?, 'run1', ?, NULL, ?, ?, '[]', ?, 'j', ?, 'ok', ?, '{}')`,
      )
      .run(id, state, via, `https://p.test/${state}`, T(at), seq, H('x'));
  const press = (id: string, [from, to]: [string, string], seq: number, key: string, at: number) =>
    r
      .prepare(
        `INSERT INTO transitions (id, run_id, from_state, to_state, action_json, safety_class, status, evidence_ref,
           confidence, stabilization, created_at, journey_id, seq, element_key, kind, result)
         VALUES (?, 'run1', ?, ?, '{}', 'read', 'executed', ?, 'observed', 'settled', ?, 'j', ?, ?, 'click', 'ok')`,
      )
      .run(id, from, to, `${H('e')}.yaml`, T(at), seq, key);
  obs('oA', 'A', 'navigate', 11, 2);
  press('t1', ['A', 'B'], 1, 'K1', 3);
  obs('oB', 'B', 'action', 12, 4);
  obs('oC', 'C', 'relogin', 13, 5);
  press('t2', ['C', 'D'], 2, 'K2', 6);
  obs('oD', 'D', 'action', 14, 7);
  return o;
}

describe('journeyPath and journeyPosition (spec 080, F-02, F-03@046)', () => {
  it("places a visit by its journey's steps, not its run-wide number", async () => {
    const o = seed();
    expect(['oA', 'oB', 'oC', 'oD'].map((id) => journeyPosition(o.raw, id))).toEqual([0, 1, 1, 2]);
    // A visit before the relogin (B, after K1): from the journey's first page, only K1.
    expect(journeyPath(o.raw, 'j', 1, T(4))).toEqual({
      startUrl: 'https://p.test/A',
      steps: ['K1'],
    });
    // Up to step 1 itself: the landing came after it.
    expect(journeyPath(o.raw, 'j', 1)).toEqual({ startUrl: 'https://p.test/A', steps: ['K1'] });
    await o.close();
  });

  it('a visit after a login starts on the landing page with the presses after it', async () => {
    const o = seed();
    expect(journeyPath(o.raw, 'j', 1, T(5))).toEqual({ startUrl: 'https://p.test/C', steps: [] });
    expect(journeyPath(o.raw, 'j', 2, T(7))).toEqual({
      startUrl: 'https://p.test/C',
      steps: ['K2'],
    });
    expect(journeyPath(o.raw, 'j', 2)).toEqual({ startUrl: 'https://p.test/C', steps: ['K2'] });
    await o.close();
  });
});
