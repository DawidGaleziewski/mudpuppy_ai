// Directed runs (spec 034 R-66, design 11-map-runs §4–§6): what a run of type continue, focused,
// recheck or retry may queue, as plain data the frontier and the enqueue step consult. The plan is
// resolved once in `start_run` (marks, the parent's frontier, the failed action) and kept on the
// run row (`plan_json`), so a restarted server reads the same plan.

import { z } from 'zod';

export const DirectedType = z.enum(['continue', 'focused', 'recheck', 'retry']);
export type DirectedType = z.infer<typeof DirectedType>;

export const Variation = z.enum(['none', 'wait_longer', 'other_input', 'no_submit']);
export type Variation = z.infer<typeof Variation>;

/** What the agent or the chat service asks for (`start_run` input `plan`). */
export const PlanInput = z
  .object({
    parent_run_id: z.string().min(1).optional(),
    start_state_ids: z.array(z.string().min(1)).min(1).max(20).optional(),
    depth: z.number().int().min(0).max(10).optional(),
    target_edge_id: z.string().min(1).optional(),
    variation: Variation.optional(),
  })
  .strict();
export type PlanInput = z.infer<typeof PlanInput>;

/** An action named the way two runs can agree on: the state it was issued on, its role and name. */
export interface ActionRef {
  state_id: string;
  role: string;
  name: string | null;
}

export const actionKey = (a: ActionRef): string => `${a.state_id}|${a.role}|${a.name ?? ''}`;

/** The resolved plan stored on the run (`runs.plan_json`). */
export const ResolvedPlan = z.object({
  type: DirectedType,
  parent_run_id: z.string().nullable(),
  start_state_ids: z.array(z.string()),
  /** Depth from a start point (design §5 "within depth N from there"); null keeps the portal's. */
  depth: z.number().int().nullable(),
  skip_states: z.array(z.string()),
  /** `actionKey`s of Skip-marked actions. */
  skip_actions: z.array(z.string()),
  /** A retry run queues only this action (its `actionKey`). */
  only_action: z.string().nullable(),
  variation: Variation,
  target_edge_id: z.string().nullable(),
  /** `actionKey`s the parent run already did (a continue run does not redo them). */
  parent_done: z.array(z.string()),
  mark_ids: z.array(z.string()),
});
export type ResolvedPlan = z.infer<typeof ResolvedPlan>;

/** The default depth of a focused run when the plan names none. */
export const FOCUSED_DEPTH = 2;

export function parsePlan(json: string | null | undefined): ResolvedPlan | null {
  if (json === null || json === undefined) return null;
  try {
    return ResolvedPlan.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

/**
 * Whether the run may queue an action for exploration: a recheck queues nothing, a retry only the
 * failed action, Skip marks and the parent's done actions are left out.
 */
export function mayQueue(plan: ResolvedPlan | null, a: ActionRef): boolean {
  if (plan === null) return true;
  if (plan.type === 'recheck') return false;
  const key = actionKey(a);
  if (plan.only_action !== null) return key === plan.only_action;
  if (plan.skip_states.includes(a.state_id) || plan.skip_actions.includes(key)) return false;
  return !plan.parent_done.includes(key);
}

/** A frontier item may be handed out unless it leads into or acts on something Skip-marked. */
export function skippedItem(
  plan: ResolvedPlan | null,
  a: ActionRef,
  targetState: string | null,
): boolean {
  if (plan === null) return false;
  if (plan.skip_actions.includes(actionKey(a))) return true;
  return targetState !== null && plan.skip_states.includes(targetState);
}
