/**
 * Rules R1–R8 (spec 039 design § 8.2; constitution 6.0.0 "Derived facts"): deterministic
 * classification of a deviation. Run in order; the first rule that decides ends the chain. A rule
 * that needs evidence it does not have asks for deterministic replays (the headless driver, design
 * § 9) and decides once their results are in. Pure.
 */
import type { DeviationKind } from './deviations.js';

export type HypothesisKind =
  | 'structural_drift'
  | 'backend_drift'
  | 'decision_drift'
  | 'context_variant'
  | 'ab_test'
  | 'flaky'
  | 'nondeterministic'
  | 'deterministic_error'
  | 'removed'
  | 'replaces'
  | 'decision_point'
  | 'ambiguous';

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8';

/** What a deviation looks like next to its reference observation. */
export interface RuleContext {
  kind: DeviationKind;
  /** The step result of the deviating observation or transition. */
  result: string;
  /** The build of the scope owning the changed region differs from the reference's. */
  buildChanged: boolean;
  /** An endpoint schema on the transition changed (same frontend builds). */
  schemaChanged: boolean;
  /** Audience (persona, environment) or typed inputs differ from the reference. */
  contextDiffers: boolean;
  /** Same build epoch and audience as the reference (R7). */
  sameEpochAndAudience: boolean;
  /** R6: the element is still present for another audience. */
  presentForOtherAudience: boolean;
  /** R6: a new action connects the same two screens in this epoch. */
  newActionSameScreens: boolean;
  /** Replay results asked for earlier; absent until the driver ran them. */
  replays?: {
    /** R1: results of the replays of the failing step. */
    same?: readonly string[];
    /** R4: each context replayed: does it reproduce its own outcome? */
    reference?: boolean;
    current?: boolean;
    /** R5: outcomes (target and result) of three replays in one context. */
    repeated?: readonly string[];
    /** R5: a flag (cookie/storage key) whose value separates the alternating outcomes. */
    separatingFlag?: string | null;
    /** R8: the replay reproduced the rule mismatch. */
    ruleReproduced?: boolean;
  };
}

export type RuleDecision =
  | {
      decision: 'hypothesis';
      kind: HypothesisKind;
      rule: RuleId;
      /** Applied without a person (constitution 6.0.0); false waits for a person or the agent. */
      derived: boolean;
      note?: string;
    }
  | { decision: 'replay'; rule: RuleId; replays: number; what: 'same' | 'both_contexts' | 'repeat' }
  | { decision: 'ambiguous' };

const derived = (kind: HypothesisKind, rule: RuleId, note?: string): RuleDecision => ({
  decision: 'hypothesis',
  kind,
  rule,
  derived: true,
  ...(note ? { note } : {}),
});
const forPerson = (kind: HypothesisKind, rule: RuleId, note?: string): RuleDecision => ({
  decision: 'hypothesis',
  kind,
  rule,
  derived: false,
  ...(note ? { note } : {}),
});

/** R1 errors: replay twice; all fail → deterministic error (a person), any success → flaky. */
function r1(c: RuleContext): RuleDecision | null {
  if (c.result !== 'technical_error' && c.result !== 'timeout') return null;
  const same = c.replays?.same;
  if (!same) return { decision: 'replay', rule: 'R1', replays: 2, what: 'same' };
  if (same.some((r) => r !== 'technical_error' && r !== 'timeout')) return derived('flaky', 'R1');
  return forPerson('deterministic_error', 'R1', 'a business rule or a defect: a person decides');
}

/** R2 drift: the owning scope's build changed. */
const r2 = (c: RuleContext): RuleDecision | null =>
  c.buildChanged ? derived('structural_drift', 'R2') : null;

/** R3 backend: result or target changed with equal frontend builds, and an endpoint schema changed. */
function r3(c: RuleContext): RuleDecision | null {
  if (c.kind !== 'result_mismatch' && c.kind !== 'target_mismatch') return null;
  return c.schemaChanged ? forPerson('backend_drift', 'R3') : null;
}

/** R4 context: replay with the reference context and with this one; each reproduces its own → variant. */
function r4(c: RuleContext): RuleDecision | null {
  if (!c.contextDiffers) return null;
  const r = c.replays;
  if (r?.reference === undefined || r.current === undefined)
    return { decision: 'replay', rule: 'R4', replays: 2, what: 'both_contexts' };
  if (r.reference && r.current)
    return derived('context_variant', 'R4', 'the differing attributes go to decision mining');
  return null; // not reproduced: R5 looks at randomness
}

/** R5 randomness: three replays in one context; alternating with one separating flag → A/B test. */
function r5(c: RuleContext): RuleDecision | null {
  const repeated = c.replays?.repeated;
  if (!repeated) return { decision: 'replay', rule: 'R5', replays: 3, what: 'repeat' };
  if (new Set(repeated).size <= 1) return null; // stable: nothing random to explain
  if (c.replays?.separatingFlag)
    return forPerson('ab_test', 'R5', `separated by ${c.replays.separatingFlag}`);
  return forPerson('nondeterministic', 'R5', 'for the agent: write a hypothesis with a test');
}

/** R6 absence: why an action class went missing. */
function r6(c: RuleContext): RuleDecision | null {
  if (c.kind !== 'missing_action') return null;
  if (c.buildChanged) return derived('removed', 'R6', 'removed with a release');
  if (c.presentForOtherAudience)
    return derived('context_variant', 'R6', 'shown to another audience');
  if (c.newActionSameScreens) return derived('replaces', 'R6');
  return forPerson('removed', 'R6', 'removed within one build: a person decides');
}

/** R7 targets: a known action leading elsewhere in the same epoch and audience → a decision point. */
function r7(c: RuleContext): RuleDecision | null {
  if (c.kind !== 'target_mismatch') return null;
  return c.sameEpochAndAudience ? forPerson('decision_point', 'R7', 'mine its rule') : null;
}

/** R8 rules: a boundary test returned a target the rule does not predict; reproduced → drift. */
function r8(c: RuleContext): RuleDecision | null {
  if (c.kind !== 'rule_mismatch') return null;
  if (c.replays?.ruleReproduced === undefined)
    return { decision: 'replay', rule: 'R8', replays: 1, what: 'same' };
  return c.replays.ruleReproduced
    ? derived('decision_drift', 'R8', 're-mine the rule on the new epoch')
    : derived('flaky', 'R8', 'the mismatch did not reproduce');
}

/**
 * Classify one deviation. R6 and R8 answer their own kinds first (absence and rule tests are not
 * structural changes of a page); the others run R1 → R5 → R7 in the design's order.
 */
export function classify(c: RuleContext): RuleDecision {
  if (c.kind === 'missing_action') return r6(c) ?? { decision: 'ambiguous' };
  if (c.kind === 'rule_mismatch') return r8(c) ?? { decision: 'ambiguous' };
  for (const rule of [r1, r2, r3, r7, r4]) {
    const d = rule(c);
    if (d) return d;
  }
  // Same build, same context and nothing explained it: is it random? A screen that shows another
  // version to the same audience (a new member) asks too: an A/B test is one (spec 046, R-88).
  if (c.kind === 'result_mismatch' || c.kind === 'target_mismatch' || c.kind === 'new_member') {
    const d = r5(c);
    if (d) return d;
  }
  return { decision: 'ambiguous' };
}
