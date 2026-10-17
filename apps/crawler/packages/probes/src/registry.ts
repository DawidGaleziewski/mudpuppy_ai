// The catalogue and the choice of tries within a budget (spec 032 US2.7, O-M4). The budget is shared
// round-robin across the probes, so a step with many fields still gets one try of every kind before
// any probe gets a second one; what does not fit is listed as skipped, never silently dropped.

import { options } from './catalogue/branch.js';
import { blockRequest, delay, http500, offline } from './catalogue/technical.js';
import {
  boundaries,
  optionalEmpty,
  requiredEmptyAll,
  requiredEmptyOne,
  wrongFormat,
} from './catalogue/validation.js';
import type { Probe, ProbeContext, ProbeTry } from './define.js';

/** In priority order: the order the round-robin visits them. */
export const PROBES: readonly Probe[] = [
  requiredEmptyAll,
  options,
  http500,
  blockRequest,
  wrongFormat,
  requiredEmptyOne,
  boundaries,
  optionalEmpty,
  delay,
  offline,
];

export const PROBE_IDS: readonly string[] = PROBES.map((p) => p.id);

export interface Planned {
  tries: ProbeTry[];
  /** Tries that apply but did not fit the budget, by key. */
  skipped: string[];
}

export interface PlanOptions {
  /** How many tries fit (the per-step budget, cut by what is left of the run's). */
  limit: number;
  /** Probe ids or groups to keep; absent = all. */
  only?: readonly string[];
  /** Technical probes are left out (no request to break, or the agent asked so). */
  noTechnical?: boolean;
}

const wanted = (p: Probe, o: PlanOptions): boolean =>
  (o.only === undefined || o.only.includes(p.id) || o.only.includes(p.group)) &&
  !(o.noTechnical && p.group === 'technical');

/** The tries for one step, within the budget. */
export function planTries(ctx: ProbeContext, o: PlanOptions): Planned {
  const queues = PROBES.filter((p) => wanted(p, o)).map((p) => p.tries(ctx));
  const tries: ProbeTry[] = [];
  const skipped: string[] = [];
  for (let round = 0; queues.some((q) => q.length > round); round++)
    for (const q of queues) {
      const t = q[round];
      if (t === undefined) continue;
      if (tries.length < o.limit) tries.push(t);
      else skipped.push(t.key);
    }
  return { tries, skipped };
}

/** Unknown names in `only` (the agent's input), for a clear refusal. */
export const unknownProbes = (only: readonly string[]): string[] =>
  only.filter((x) => !PROBE_IDS.includes(x) && !['validation', 'branch', 'technical'].includes(x));
