// Building a BA process's as-is steps from recorded states, and the key of a grouping (spec 022
// M5). Pure; shared by the chat service (accepting a grouping) and the trace driver's grouping
// suggestion (spec 031 US5).

import type { ProcessStep } from './schemas/ba-process.js';

/** A recorded state as a step needs it. */
export interface StateRow {
  id: string;
  title: string;
  route_template: string;
  screen_id: string | null;
}

/** Observed steps in the given order, ids s1, s2, … (accepting a grouping, the as-is A r1). */
export function observedSteps(states: readonly StateRow[]): ProcessStep[] {
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

/** The set of screens a grouping covers: sorted state ids, joined; a dismissed key is refused. */
export function screensKey(stateIds: readonly string[]): string {
  return [...new Set(stateIds)].sort().join(',');
}
