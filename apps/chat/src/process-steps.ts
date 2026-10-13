// Pure rules for BA process steps (spec 022 M5, data-model "Steps"): validation, building the
// as-is steps from recorded states, the next variant label, the screens key of a grouping.
// No database here; process-service.ts loads and writes.

import { ProcessStep } from '@pathfinder/chat-model';
import { z } from 'zod';
import { HttpError } from './http-error.js';

export const Steps = z.array(ProcessStep).min(1).max(200);
export type Steps = z.infer<typeof Steps>;

/** A recorded state as a step needs it. */
export interface StateRow {
  id: string;
  title: string;
  route_template: string;
  screen_id: string | null;
}

/** Observed steps in the given order, ids s1, s2, … (accepting a grouping, the as-is A r1). */
export function observedSteps(states: readonly StateRow[]): Steps {
  return states.map((s, i) => ({
    id: `s${String(i + 1)}`,
    title: s.title,
    route: s.route_template,
    state_id: s.id,
    screen_id: s.screen_id,
    observed: true,
    from: [],
    annotations: [],
  }));
}

/**
 * Check a variant's steps: unique ids, `from` pointing at steps of the variant it was branched
 * from, observed steps naming a state of the portal. Throws 400 with every problem.
 */
export function checkSteps(
  steps: Steps,
  opts: { knownStates: ReadonlySet<string>; parentStepIds: ReadonlySet<string> },
): void {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const s of steps) {
    if (seen.has(s.id)) problems.push(`step id ${s.id} is used twice`);
    seen.add(s.id);
    if (s.observed && (s.state_id === null || !opts.knownStates.has(s.state_id)))
      problems.push(`step ${s.id} is marked observed but names no recorded screen of this portal`);
    for (const f of s.from)
      if (!opts.parentStepIds.has(f))
        problems.push(`step ${s.id} comes from ${f}, which the variant it was branched from lacks`);
  }
  if (problems.length > 0)
    throw new HttpError(400, `The steps are not valid: ${problems.join('; ')}.`, {
      code: 'INVALID',
      details: problems,
    });
}

/** The next free label after A: B, C, … Z, then AA. */
export function nextLabel(labels: readonly string[]): string {
  const used = new Set(labels);
  for (let n = 1; ; n++) {
    const label = toLabel(n);
    if (!used.has(label)) return label;
  }
}

function toLabel(n: number): string {
  let s = '';
  for (let k = n; k >= 0; k = Math.floor(k / 26) - 1) s = String.fromCharCode(65 + (k % 26)) + s;
  return s;
}

/** The identity of a grouping for "never suggest a dismissed one again" (FR-007). */
export function screensKey(stateIds: readonly string[]): string {
  return [...new Set(stateIds)].sort().join(',');
}

/** `PRC-001`, `PRC-002`, … after the largest key in use. */
export function nextProcessKey(keys: readonly string[]): string {
  let max = 0;
  for (const k of keys) {
    const n = Number(k.slice('PRC-'.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `PRC-${String(max + 1).padStart(3, '0')}`;
}
