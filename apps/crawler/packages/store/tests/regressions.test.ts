import { describe, expect, it } from 'vitest';
import {
  decideHypothesis,
  hypothesisEvents,
  pendingMismatchReplays,
  queueRegressions,
  recordRuleMismatches,
  resolveRuleMismatch,
  type OpenedDb,
} from '../src/index.js';
import { portalAnswer, replayAll, T, TODAY, withRule } from './seed-threshold.js';

/** The rule "under 18" tested, supported and confirmed by a person. */
function confirmed(): OpenedDb {
  const o = withRule(18);
  replayAll(o);
  decideHypothesis(o.raw, {
    portal: 'ins',
    key: 'H-0001',
    decision: 'confirm',
    actor: 'owner',
    reason: 'the terms say 18',
    now: T(950),
  });
  return o;
}

const statusOf = (o: OpenedDb, key: string) =>
  hypothesisEvents(
    o.raw,
    (o.raw.prepare('SELECT id FROM hypotheses WHERE key = ?').get(key) as { id: string }).id,
  ).at(-1)!.to;

describe('decision drift (spec 039 design § 11.6, rule R8)', () => {
  it('a release queues the regression suite; without one, only model:regress does', async () => {
    const o = confirmed();
    expect(queueRegressions(o.raw, 'ins', { now: T(1000) })).toEqual([]); // same builds
    expect(queueRegressions(o.raw, 'ins', { all: true, now: T(1000) })).toEqual(['H-0001']);
    expect(queueRegressions(o.raw, 'ins', { all: true, now: T(1001) })).toEqual([]); // round pending
    await o.close();
  });

  it('a regression that still passes leaves the rule confirmed', async () => {
    const o = confirmed();
    queueRegressions(o.raw, 'ins', { all: true, now: T(1000) });
    expect(replayAll(o, 18, T(1100)).moves).toEqual([]);
    expect(recordRuleMismatches(o.raw, 'ins', T(1101))).toEqual([]);
    expect(statusOf(o, 'H-0001')).toBe('confirmed');
    await o.close();
  });

  it('the threshold moved to 21: a mismatch, R8 reproduces it, drift is derived and the rule superseded', async () => {
    const o = confirmed();
    queueRegressions(o.raw, 'ins', { all: true, now: T(1000) });
    expect(replayAll(o, 21, T(1100)).moves).toEqual([]); // a confirmed rule is never refuted
    expect(statusOf(o, 'H-0001')).toBe('confirmed');
    const [deviation] = recordRuleMismatches(o.raw, 'ins', T(1101));
    expect(deviation).toBeDefined();
    expect(recordRuleMismatches(o.raw, 'ins', T(1102))).toEqual([]); // one per rule
    const [r8] = pendingMismatchReplays(o.raw, 'ins', { today: TODAY });
    expect(r8!.deviationId).toBe(deviation);
    const answer = portalAnswer(r8!.plan.inputs['input.data_urodzenia']!, 21);
    const key = resolveRuleMismatch(
      o.raw,
      'ins',
      deviation!,
      { state_id: answer.stateId, edge_id: answer.edgeId },
      T(1200),
    );
    const h = o.raw.prepare('SELECT kind, rule, derived FROM hypotheses WHERE key = ?').get(key);
    expect(h).toEqual({ kind: 'decision_drift', rule: 'R8', derived: 1 });
    expect(statusOf(o, 'H-0001')).toBe('superseded');
    expect(pendingMismatchReplays(o.raw, 'ins', { today: TODAY })).toEqual([]);
    await o.close();
  });

  it('a mismatch that does not reproduce is flaky; the rule stays confirmed', async () => {
    const o = confirmed();
    queueRegressions(o.raw, 'ins', { all: true, now: T(1000) });
    replayAll(o, 21, T(1100));
    const [deviation] = recordRuleMismatches(o.raw, 'ins', T(1101));
    const [r8] = pendingMismatchReplays(o.raw, 'ins', { today: TODAY });
    const answer = portalAnswer(r8!.plan.inputs['input.data_urodzenia']!, 18);
    const key = resolveRuleMismatch(
      o.raw,
      'ins',
      deviation!,
      { state_id: answer.stateId, edge_id: answer.edgeId },
      T(1200),
    );
    expect(o.raw.prepare('SELECT kind FROM hypotheses WHERE key = ?').get(key)).toEqual({
      kind: 'flaky',
    });
    expect(statusOf(o, 'H-0001')).toBe('confirmed');
    await o.close();
  });
});
