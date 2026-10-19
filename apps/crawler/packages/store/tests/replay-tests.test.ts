import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  importMinedRule,
  judgeReplays,
  loadObservationTables,
  migrateUp,
  openDb,
  pendingReplays,
  reconcilePortalModel,
  recordReplay,
  type OpenedDb,
} from '../src/index.js';
import { seedThreshold, SUBMIT, T } from './seed-threshold.js';

const MIGRATIONS = join(import.meta.dirname, '../../../../../data/migrations');
const TODAY = '2026-10-19';

/** The seeded portal with a mined rule "under `cut` → exit page"; returns the db. */
function withRule(cut: number): OpenedDb {
  const o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  seedThreshold(o);
  reconcilePortalModel(o.raw, 'ins', { now: T(500) });
  const [table] = loadObservationTables(o.raw, 'ins');
  const target = (birth: string) =>
    table!.rows.find((r) => r.features['input.data_urodzenia'] === birth)!.target;
  const age = 'derived.input.data_urodzenia.age_years';
  importMinedRule(
    o.raw,
    'ins',
    table!,
    {
      decisionPoint: { screen: table!.decision_point.screen, action: SUBMIT },
      hitPolicy: 'U',
      inputs: [{ name: age, type: 'number' }],
      outputs: [{ name: 'next', type: 'screen' }],
      rules: [
        { when: { [age]: `< ${cut}` }, then: target('2010-03-01') },
        { when: { [age]: `>= ${cut}` }, then: target('1980-05-01') },
      ],
      fitness: 1,
      precision: 1,
      rows: 11,
    },
    T(600),
  );
  return o;
}

/** What the real portal does: under 18 → the exit page (edge e0), else the price page (e5). */
function portalAnswer(birth: string) {
  const age =
    Number(TODAY.slice(0, 4)) -
    Number(birth.slice(0, 4)) -
    (birth.slice(5) > TODAY.slice(5) ? 1 : 0);
  return age < 18 ? { stateId: 'exit', edgeId: 'e0' } : { stateId: 'price', edgeId: 'e5' };
}

function runAll(o: OpenedDb) {
  const plans = pendingReplays(o.raw, 'ins', { limit: 20, today: TODAY });
  for (const p of plans)
    recordReplay(o.raw, p.testId, {
      status: 'reached',
      runId: 'run1',
      ...portalAnswer(p.inputs['input.data_urodzenia']!),
    });
  return { plans, moves: judgeReplays(o.raw, 'ins', T(900)) };
}

describe('boundary tests on the headless driver (spec 039 design § 9, § 11.5)', () => {
  it('plans the recorded path with the birth date of each tested age', async () => {
    const o = withRule(18);
    const plans = pendingReplays(o.raw, 'ins', { limit: 20, today: TODAY });
    expect(plans).toHaveLength(3);
    expect(plans[0]).toMatchObject({
      persona: 'guest',
      environment: 'sandbox',
      startUrl: 'https://ins.test/kalkulator/kierowca',
      steps: [SUBMIT],
    });
    expect(plans.map((p) => p.inputs['input.data_urodzenia'])).toEqual([
      '2009-04-19',
      '2008-04-19',
      '2007-04-19',
    ]);
    expect(pendingReplays(o.raw, 'ins', { limit: 1, today: TODAY })).toHaveLength(1);
    await o.close();
  });

  it('a rule the portal follows is supported; the person still confirms', async () => {
    const o = withRule(18);
    const { moves } = runAll(o);
    expect(moves).toEqual([{ hypothesis: 'H-0001', to: 'supported' }]);
    const verdicts = o.raw.prepare('SELECT verdict FROM hypothesis_tests').all();
    expect(verdicts).toEqual([{ verdict: 'pass' }, { verdict: 'pass' }, { verdict: 'pass' }]);
    const events = o.raw
      .prepare('SELECT to_status, actor FROM hypothesis_events ORDER BY at, id')
      .all();
    expect(events.map((e) => (e as { to_status: string }).to_status)).toEqual([
      'proposed',
      'testing',
      'supported',
    ]);
    await o.close();
  });

  it('the gap rule (< 22, F-18) is refuted by the test at 21', async () => {
    const o = withRule(22);
    const { moves } = runAll(o);
    expect(moves).toEqual([{ hypothesis: 'H-0001', to: 'refuted' }]);
    const fails = o.raw
      .prepare("SELECT inputs_json FROM hypothesis_tests WHERE verdict = 'fail'")
      .all() as { inputs_json: string }[];
    expect(
      fails.map(
        (f) =>
          (JSON.parse(f.inputs_json) as Record<string, number>)[
            'derived.input.data_urodzenia.age_years'
          ],
      ),
    ).toEqual([21]);
    expect(judgeReplays(o.raw, 'ins', T(901))).toEqual([]); // judged once
    await o.close();
  });

  it('a diverged replay is inconclusive, never a fail', async () => {
    const o = withRule(18);
    const [p] = pendingReplays(o.raw, 'ins', { limit: 1, today: TODAY });
    recordReplay(o.raw, p!.testId, {
      status: 'diverged',
      runId: null,
      atStep: 1,
      reason: 'no element',
    });
    expect(
      o.raw.prepare('SELECT verdict FROM hypothesis_tests WHERE id = ?').get(p!.testId),
    ).toEqual({
      verdict: 'inconclusive',
    });
    expect(pendingReplays(o.raw, 'ins', { limit: 20, today: TODAY })).toHaveLength(2);
    await o.close();
  });
});
