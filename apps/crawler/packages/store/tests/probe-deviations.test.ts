// A form probe's refused input or injected fault is not a change of the portal (F-58@039): the
// reference-insurer trials of 2026-10-21 had 12 target mismatches, all probe outcomes, which R7
// turned into decision-point hypotheses.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrateUp, openDb, reconcilePortalModel, type OpenedDb } from '../src/index.js';
import { seedThreshold, SUBMIT, T } from './seed-threshold.js';

const MIGRATIONS = join(import.meta.dirname, '../../../../../data/migrations');

/** The reconciled threshold seed, then a second run whose submit stays on the form. */
function withRefusedSubmit(probe: { fault: string | null; kind: string } | null): OpenedDb {
  const o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  seedThreshold(o);
  reconcilePortalModel(o.raw, 'ins', { now: T(500) });
  const r = o.raw;
  r.prepare(
    `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser,
       config_snapshot, status, started_at) VALUES ('run2', 'ins', 'guest', 'map', 'sandbox', '2026-10-19',
       '1280x800', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
  ).run(T(600));
  r.prepare(
    "INSERT INTO journeys (id, run_id, start_kind, started_at) VALUES ('jp', 'run2', 'entry_url', ?)",
  ).run(T(600));
  r.prepare(
    `INSERT INTO observations (id, run_id, state_id, transition_id, via, url, hops_json, created_at, journey_id, seq, result,
       context_key, flags_json) VALUES ('vp', 'run2', 'form', NULL, 'navigate', 'https://ins.test/kalkulator/kierowca', '[]', ?, 'jp', 1, 'ok', ?, '{}')`,
  ).run(T(601), 'x'.repeat(64));
  r.prepare(
    `INSERT INTO transitions (id, run_id, from_state, to_state, action_json, safety_class, status, evidence_ref, confidence,
       stabilization, created_at, journey_id, seq, from_observation_id, element_key, kind, result)
     VALUES ('ep', 'run2', 'form', 'form', '{}', 'read', 'executed', 'e.yaml', 'observed', 'settled', ?, 'jp', 2, 'vp', ?, 'submit', 'ok')`,
  ).run(T(602), SUBMIT);
  if (probe)
    r.prepare(
      `INSERT INTO probe_outcomes (id, run_id, from_state_id, probe_id, probe_group, inputs_json, path_json, fault,
         outcome_kind, to_state_id, messages_json, evidence_ref, transition_id, created_at)
       VALUES ('po', 'run2', 'form', 'p', ?, '[]', '{}', ?, ?, 'form', '[]', 'e.yaml', 'ep', ?)`,
    ).run(probe.fault ? 'technical' : 'validation', probe.fault, probe.kind, T(603));
  reconcilePortalModel(o.raw, 'ins', { now: T(700) });
  return o;
}

const mismatches = (o: OpenedDb) =>
  o.raw.prepare("SELECT count(*) AS n FROM deviations WHERE kind = 'target_mismatch'").get();

describe('form probes and deviations (F-58@039)', () => {
  it('a submit that newly stays on the form is a target mismatch', async () => {
    const o = withRefusedSubmit(null);
    expect(mismatches(o)).toEqual({ n: 1 });
    // the claim names the screen and the action a reader can look up
    const claims = o.raw.prepare('SELECT claim FROM hypotheses').all() as { claim: string }[];
    expect(claims.map((c) => c.claim)).toEqual([
      'button "oblicz składkę" on screen SC-0001 "form" leads to different screens depending on data.',
    ]);
    await o.close();
  });

  it.each([
    { fault: null, kind: 'validation' },
    { fault: 'http_500', kind: 'technical' },
  ])('the same submit made by a probe ($kind) is not', async (probe) => {
    const o = withRefusedSubmit(probe);
    expect(mismatches(o)).toEqual({ n: 0 });
    await o.close();
  });
});
