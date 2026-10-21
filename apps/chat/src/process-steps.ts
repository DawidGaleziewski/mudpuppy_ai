// Pure rules for BA process steps (spec 022 M5, data-model "Steps"): validation, building the
// as-is steps from recorded states, the next model label, the screens key of a grouping.
// No database here; process-service.ts loads and writes.

import { observedSteps, ProcessStep, type StateRow } from '@pathfinder/chat-model';
import { z } from 'zod';
import { HttpError } from './http-error.js';

export const Steps = z.array(ProcessStep).min(1).max(200);
export type Steps = z.infer<typeof Steps>;

// Shared with the trace driver's grouping suggestion (spec 031 US5).
export { observedSteps, screensKey, type StateRow } from '@pathfinder/chat-model';

/**
 * A's steps after a person's edit (spec 027 FR-004): `states` in their new order. A step whose
 * screen stays is kept as it was (id, annotations); a new screen gets an `sN` id above every id
 * the model ever used (`usedIds`), so History and Compare never pair it with an older step.
 * The same screen twice keeps two steps.
 */
export function editedSteps(
  current: readonly ProcessStep[],
  states: readonly StateRow[],
  usedIds: readonly string[],
): ProcessStep[] {
  const pool = [...current];
  let last = Math.max(0, ...usedIds.map((id) => Number(/^s(\d+)$/.exec(id)?.[1] ?? 0)));
  return states.map((state) => {
    const i = pool.findIndex((s) => s.state_id === state.id);
    if (i >= 0) return pool.splice(i, 1)[0]!;
    last += 1;
    return { ...observedSteps([state])[0]!, id: `s${String(last)}` };
  });
}

/** The one line History shows for an edit of A; refuses an edit that changes nothing. */
export function editNote(before: readonly ProcessStep[], after: readonly ProcessStep[]): string {
  const was = new Set(before.map((s) => s.id));
  const now = new Set(after.map((s) => s.id));
  const added = after.filter((s) => !was.has(s.id)).length;
  const removed = before.filter((s) => !now.has(s.id)).length;
  const keptAfter = after.filter((s) => was.has(s.id)).map((s) => s.id);
  const keptBefore = before.filter((s) => now.has(s.id)).map((s) => s.id);
  const parts = [
    added > 0 ? `added ${String(added)} screen${added === 1 ? '' : 's'}` : null,
    removed > 0 ? `removed ${String(removed)} step${removed === 1 ? '' : 's'}` : null,
    keptAfter.join() === keptBefore.join() ? null : 'changed the order',
  ].filter((p): p is string => p !== null);
  if (parts.length === 0)
    throw new HttpError(409, 'The as-is already has these screens in this order.', {
      code: 'UNCHANGED',
    });
  const line = parts.join(', ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/**
 * Check a model's steps: unique ids, `from` pointing at steps of the model it was branched
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
        problems.push(`step ${s.id} comes from ${f}, which the model it was branched from lacks`);
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

/** `PRC-001`, `PRC-002`, … after the largest key in use. */
export function nextProcessKey(keys: readonly string[]): string {
  let max = 0;
  for (const k of keys) {
    const n = Number(k.slice('PRC-'.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `PRC-${String(max + 1).padStart(3, '0')}`;
}
