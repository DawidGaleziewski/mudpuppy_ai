import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addHypothesisTest,
  decideHypothesis,
  getHypothesis,
  HypothesisInputError,
  listDeviations,
  listHypotheses,
  migrateUp,
  openDb,
  proposeHypothesis,
  reconcilePortalModel,
  type OpenedDb,
} from '../src/index.js';

const MIGRATIONS = join(import.meta.dirname, '../../../../../data/migrations');
const T = '2026-10-20T12:00:00.000Z';

/** One state with components, reconciled into one screen (SC-0001). */
function open(): OpenedDb {
  const o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  o.raw
    .prepare(
      `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale,
         browser, config_snapshot, status, started_at) VALUES ('r1', 'p', 'guest', 'map', 'sandbox',
         '2026-10-20', '1280x800', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
    )
    .run(T);
  o.raw
    .prepare(
      `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref,
         confidence, stabilization, first_seen_run, created_at)
       VALUES ('s1', 'p', ?, 'c', '/', 'Start', 'e.yaml', 'observed', 'settled', 'r1', ?)`,
    )
    .run('a'.repeat(64), T);
  o.raw
    .prepare(
      `INSERT INTO state_components (state_id, structure_hash, content_hash, overlay_hash, calls_hash,
         mounts_hash, minhash, element_keys) VALUES ('s1', ?, ?, ?, ?, ?, ?, '[]')`,
    )
    .run(
      's'.repeat(64),
      'c'.repeat(64),
      'o'.repeat(64),
      'a'.repeat(64),
      'm'.repeat(64),
      Buffer.alloc(512),
    );
  return o;
}

const TEST = { inputs: { 'input.age': 17 }, refutes_if: { notIn: ['SC-0002 ok'] } };

describe('agent hypotheses (spec 039 T055)', () => {
  it('needs a model, a test (unless a label settles it) and known evidence', async () => {
    const o = open();
    const base = {
      portal: 'p',
      kind: 'decision_rule' as const,
      claim: 'Drivers under 18 are refused.',
      evidence: [{ kind: 'state' as const, id: 's1' }],
      tests: [TEST],
      actor: 'ba-agent',
    };
    expect(() => proposeHypothesis(o.raw, base, T)).toThrow(HypothesisInputError);
    reconcilePortalModel(o.raw, 'p', { now: T });
    expect(() => proposeHypothesis(o.raw, { ...base, tests: [] }, T)).toThrow(/needs a test/);
    expect(() =>
      proposeHypothesis(o.raw, { ...base, evidence: [{ kind: 'state', id: 'nope' }] }, T),
    ).toThrow(/no state nope/);
    const same = proposeHypothesis(
      o.raw,
      {
        ...base,
        kind: 'same_as',
        claim: 'Start and Home are one screen.',
        tests: [],
        evidence: [{ kind: 'screen', id: 'SC-0001' }],
      },
      T,
    );
    expect(same).toEqual({ key: 'H-0001', created: true });
    await o.close();
  });

  it('returns an equal open claim, refuses a refuted one, and lists and shows it', async () => {
    const o = open();
    reconcilePortalModel(o.raw, 'p', { now: T });
    const input = {
      portal: 'p',
      kind: 'decision_rule' as const,
      claim: 'Drivers under 18 are refused.',
      evidence: [{ kind: 'screen' as const, id: 'SC-0001', element_key: 'button|dalej||' }],
      tests: [TEST],
      actor: 'ba-agent',
    };
    const first = proposeHypothesis(o.raw, input, T);
    expect(proposeHypothesis(o.raw, input, T)).toEqual({ key: first.key, created: false });
    addHypothesisTest(o.raw, { portal: 'p', key: first.key, test: TEST }, T);
    const listed = listHypotheses(o.raw, 'p');
    expect(listed).toEqual([
      expect.objectContaining({
        key: first.key,
        status: 'proposed',
        origin: 'agent',
        tests: { total: 2, pass: 0, fail: 0, inconclusive: 0, untested: 2 },
      }),
    ]);
    const shown = getHypothesis(o.raw, 'p', first.key);
    expect(shown.evidence).toEqual([
      { role: 'supports', screen: 'SC-0001', element_key: 'button|dalej||' },
    ]);
    expect(shown.tests[0]).toMatchObject({ inputs: { 'input.age': 17 }, verdict: null });
    // A refuted claim stays refuted: the same claim again is refused.
    const id = (o.raw.prepare('SELECT id FROM hypotheses').get() as { id: string }).id;
    o.raw
      .prepare(
        `INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason, at)
         VALUES ('e2', ?, 'proposed', 'testing', 'driver', 'tests run', ?), ('e3', ?, 'testing', 'refuted', 'driver', 'test failed', ?)`,
      )
      .run(id, T, id, T);
    expect(() => proposeHypothesis(o.raw, input, T)).toThrow(/was refuted/);
    expect(() => addHypothesisTest(o.raw, { portal: 'p', key: first.key, test: TEST }, T)).toThrow(
      /refuted/,
    );
    expect(listDeviations(o.raw, 'p')).toEqual([]);
    await o.close();
  });

  it('agents propose, a person confirms', async () => {
    const o = open();
    reconcilePortalModel(o.raw, 'p', { now: T });
    const { key } = proposeHypothesis(
      o.raw,
      {
        portal: 'p',
        kind: 'process_boundary',
        claim: 'The quote ends at the summary.',
        evidence: [{ kind: 'screen', id: 'SC-0001' }],
        actor: 'ba-agent',
      },
      T,
    );
    expect(
      decideHypothesis(o.raw, {
        portal: 'p',
        key,
        decision: 'confirm',
        actor: 'Owner',
        reason: 'yes',
      }),
    ).toBe('confirmed');
    await o.close();
  });
});
