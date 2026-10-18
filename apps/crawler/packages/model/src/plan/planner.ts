/**
 * The planner (spec 039 design § 14.1): what the model does not know yet, as probe requests in
 * priority order, for the headless driver. Pure.
 */
import { compare } from '../model/clustering.js';

export type PlanKind =
  | 'rule_regression'
  | 'replay'
  | 'hypothesis_test'
  | 'coverage_visit'
  | 'input_variation'
  | 'counterexample_search';

export interface PlanItem {
  priority: 1 | 2 | 3 | 4 | 5 | 6;
  kind: PlanKind;
  /** What the probe is about: a rule, deviation, hypothesis, transition, decision point, process. */
  subject: string;
  /** Doc records anchored to the subject's screen: more first within a priority. */
  anchoredDocs: number;
}

export interface PlannerInput {
  /** Confirmed rules whose decision point's scope started a new build epoch. */
  rulesOnNewEpoch: readonly { rule: string; anchoredDocs: number }[];
  /** Deviations rules R1, R4, R5 asked replays for. */
  replays: readonly { deviation: string; anchoredDocs: number }[];
  /** Hypotheses in `testing` with tests not yet run. */
  testing: readonly { hypothesis: string; anchoredDocs: number }[];
  /** Model transitions `untested` in the current epoch, on screens with anchored docs. */
  untested: readonly { transition: string; anchoredDocs: number }[];
  /** Decision points with fewer than 5 rows for some outcome. */
  thinDecisionPoints: readonly { point: string; anchoredDocs: number }[];
  /** Processes not explored in the current epoch. */
  unexplored: readonly { process: string; anchoredDocs: number }[];
}

/** The plan, highest priority first; within a priority, better-documented subjects first. */
export function plan(input: PlannerInput, budget = Number.POSITIVE_INFINITY): PlanItem[] {
  const items: PlanItem[] = [
    ...input.rulesOnNewEpoch.map((r) => item(1, 'rule_regression', r.rule, r.anchoredDocs)),
    ...input.replays.map((r) => item(2, 'replay', r.deviation, r.anchoredDocs)),
    ...input.testing.map((h) => item(3, 'hypothesis_test', h.hypothesis, h.anchoredDocs)),
    ...input.untested
      .filter((t) => t.anchoredDocs > 0)
      .map((t) => item(4, 'coverage_visit', t.transition, t.anchoredDocs)),
    ...input.thinDecisionPoints.map((d) => item(5, 'input_variation', d.point, d.anchoredDocs)),
    ...input.unexplored.map((p) => item(6, 'counterexample_search', p.process, p.anchoredDocs)),
  ];
  return items
    .sort(
      (a, b) =>
        a.priority - b.priority || b.anchoredDocs - a.anchoredDocs || compare(a.subject, b.subject),
    )
    .slice(0, budget);
}

const item = (
  priority: PlanItem['priority'],
  kind: PlanKind,
  subject: string,
  anchoredDocs: number,
): PlanItem => ({ priority, kind, subject, anchoredDocs });
