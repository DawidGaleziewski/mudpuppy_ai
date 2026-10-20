// Resolving a directed run's plan at `start_run` (spec 034 R-66, FR-003, FR-004; design §4–§6):
// where the run starts (marks, the parent's frontier, the failed action), what it leaves out
// (Skip marks), and how each start point is reached (the recorded recipe, or why there is none).

import { nowIso } from '@pathfinder/core';
import type { ServerContext } from '../context.js';
import { ToolError } from '../errors.js';
import { resolveRecipe, type Recipe } from './checkpoints.js';
import {
  actionKey,
  FOCUSED_DEPTH,
  type DirectedType,
  type PlanInput,
  type ResolvedPlan,
} from './run-plan.js';

export interface StartPoint {
  state_id: string;
  route_template: string;
  title: string;
  /** How `go_to_state` will reach it; absent when there is no recorded way (`unreachable`). */
  how?: Recipe['how'];
  steps?: number;
  unreachable?: string;
}

interface Scope {
  portal: string;
  persona: string;
}

type Mark = { id: string; kind: string; target_kind: string; target_id: string };

type MarkKind = 'start' | 'focus' | 'probe' | 'retry' | 'recheck' | 'skip';

async function openMarks(ctx: ServerContext, portal: string, kinds: MarkKind[]): Promise<Mark[]> {
  return ctx.db
    .selectFrom('marks')
    .select(['id', 'kind', 'target_kind', 'target_id'])
    .where('portal_id', '=', portal)
    .where('kind', 'in', kinds)
    .where('used_by_run_id', 'is', null)
    .orderBy('created_at')
    .execute();
}

interface TransitionRow {
  id: string;
  run_id: string;
  from_state: string;
  to_state: string | null;
  action_json: string;
}

async function transition(ctx: ServerContext, id: string): Promise<TransitionRow | undefined> {
  return ctx.db
    .selectFrom('transitions')
    .select(['id', 'run_id', 'from_state', 'to_state', 'action_json'])
    .where('id', '=', id)
    .executeTakeFirst();
}

/** The `actionKey` of a transition's action (it stores role and name, not the action id). */
function keyOfTransition(e: Pick<TransitionRow, 'from_state' | 'action_json'>): string {
  const a = JSON.parse(e.action_json) as { role?: string; accessible_name?: string | null };
  return actionKey({ state_id: e.from_state, role: a.role ?? '', name: a.accessible_name ?? null });
}

/** Skip marks: states left out, actions left out (marked ones and those leading into a skipped state). */
async function skips(ctx: ServerContext, portal: string) {
  const marks = await openMarks(ctx, portal, ['skip']);
  const states = marks.filter((m) => m.target_kind === 'state').map((m) => m.target_id);
  const actions: string[] = [];
  for (const m of marks.filter((x) => x.target_kind === 'transition')) {
    const e = await transition(ctx, m.target_id);
    if (e) actions.push(keyOfTransition(e));
  }
  if (states.length > 0) {
    const into = await ctx.db
      .selectFrom('transitions')
      .select(['from_state', 'action_json'])
      .where('to_state', 'in', states)
      .execute();
    actions.push(...into.map(keyOfTransition));
  }
  return { states, actions: [...new Set(actions)] };
}

/** The failed action a retry repeats: the plan's transition, else the latest failed one of a Retry mark. */
async function retryTarget(ctx: ServerContext, plan: PlanInput, marks: Mark[]) {
  if (plan.target_transition_id !== undefined) return transition(ctx, plan.target_transition_id);
  for (const m of marks) {
    if (m.target_kind === 'transition') return transition(ctx, m.target_id);
    const failed = await ctx.db
      .selectFrom('transitions')
      .select(['id', 'run_id', 'from_state', 'to_state', 'action_json'])
      .where('from_state', '=', m.target_id)
      .where('error', 'is not', null)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    if (failed) return failed;
  }
  return undefined;
}

/** A stopped run's way on: the states owning its pending items, else the last screen it saw. */
async function continuation(ctx: ServerContext, parent: string) {
  const pending = await ctx.db
    .selectFrom('frontier')
    .select(['state_id'])
    .where('run_id', '=', parent)
    .where('status', '=', 'pending')
    .orderBy('priority', 'desc')
    .orderBy('id')
    .execute();
  let starts = [...new Set(pending.map((p) => p.state_id))].slice(0, 20);
  if (starts.length === 0) {
    const last = await ctx.db
      .selectFrom('state_observations as o')
      .innerJoin('states as s', 's.id', 'o.state_id')
      .select('o.state_id')
      .where('o.run_id', '=', parent)
      .where('s.state_kind', '<>', 'technical')
      .orderBy('o.observed_at', 'desc')
      .executeTakeFirst();
    starts = last ? [last.state_id] : [];
  }
  // A frontier item names its action by id; the role and name are on the action row.
  const done = await ctx.db
    .selectFrom('frontier as f')
    .innerJoin('actions as a', 'a.id', 'f.action_id')
    .select(['f.state_id', 'a.role', 'a.accessible_name'])
    .where('f.run_id', '=', parent)
    .where('f.status', '=', 'done')
    .execute();
  const doneKeys = done.map((d) =>
    actionKey({ state_id: d.state_id, role: d.role, name: d.accessible_name }),
  );
  return { starts, done: [...new Set(doneKeys)] };
}

async function startPoint(ctx: ServerContext, scope: Scope, stateId: string): Promise<StartPoint> {
  const st = await ctx.db
    .selectFrom('states')
    .select(['route_template', 'title'])
    .where('id', '=', stateId)
    .where('portal_id', '=', scope.portal)
    .executeTakeFirst();
  if (st === undefined)
    return {
      state_id: stateId,
      route_template: '-',
      title: '-',
      unreachable: 'not a state of this portal',
    };
  try {
    const r = await resolveRecipe(ctx, scope, stateId);
    return { state_id: stateId, ...st, how: r.how, steps: r.steps.length };
  } catch (e) {
    if (e instanceof ToolError && e.code === 'NO_PATH')
      return { state_id: stateId, ...st, unreachable: e.message };
    throw e;
  }
}

/** A focused run starts from Start/Focus marks, a recheck from Recheck marks (or the given states). */
async function markedPlan(
  ctx: ServerContext,
  scope: Scope,
  type: 'focused' | 'recheck',
  input: PlanInput,
  base: ResolvedPlan,
): Promise<ResolvedPlan> {
  const marks = await openMarks(
    ctx,
    scope.portal,
    type === 'focused' ? ['start', 'focus'] : ['recheck'],
  );
  const fromMarks: string[] = [];
  for (const m of marks) {
    if (m.target_kind === 'state') fromMarks.push(m.target_id);
    else if (m.target_kind === 'transition') {
      const e = await transition(ctx, m.target_id);
      if (e?.to_state) fromMarks.push(e.to_state);
    }
  }
  return {
    ...base,
    start_state_ids: [...new Set(input.start_state_ids ?? fromMarks)],
    depth: type === 'focused' ? (input.depth ?? FOCUSED_DEPTH) : 0,
    mark_ids: input.start_state_ids ? [] : marks.map((m) => m.id),
  };
}

/** A retry run replays one failed action, from a Retry mark or the given transition. */
async function retryPlan(
  ctx: ServerContext,
  scope: Scope,
  input: PlanInput,
  base: ResolvedPlan,
): Promise<ResolvedPlan> {
  const marks = await openMarks(ctx, scope.portal, ['retry']);
  const target = await retryTarget(ctx, input, marks);
  if (target === undefined)
    throw new ToolError(
      'NO_PATH',
      'no failed action to retry: give plan.target_transition_id or a Retry mark',
    );
  return {
    ...base,
    parent_run_id: input.parent_run_id ?? target.run_id,
    start_state_ids: [target.from_state],
    only_action: keyOfTransition(target),
    target_transition_id: target.id,
    mark_ids: input.target_transition_id ? [] : marks.map((m) => m.id),
  };
}

/** A continue run picks up where a stopped run left off. */
async function continuePlan(
  ctx: ServerContext,
  input: PlanInput,
  base: ResolvedPlan,
): Promise<ResolvedPlan> {
  if (input.parent_run_id === undefined)
    throw new ToolError('SCHEMA_INVALID', 'a continue run needs plan.parent_run_id', {
      field: 'plan',
    });
  const c = await continuation(ctx, input.parent_run_id);
  return { ...base, start_state_ids: c.starts, parent_done: c.done, depth: input.depth ?? null };
}

/**
 * The plan of a new directed run, its start points with how each is reached, and the marks it
 * uses. Refused when the plan has nothing to start from or no start point can be reached.
 */
export async function resolveDirected(
  ctx: ServerContext,
  scope: Scope,
  type: DirectedType,
  input: PlanInput,
): Promise<{ plan: ResolvedPlan; startPoints: StartPoint[] }> {
  const skip = await skips(ctx, scope.portal);
  const base: ResolvedPlan = {
    type,
    parent_run_id: input.parent_run_id ?? null,
    start_state_ids: [],
    depth: null,
    skip_states: skip.states,
    skip_actions: skip.actions,
    only_action: null,
    variation: input.variation ?? 'none',
    target_transition_id: null,
    parent_done: [],
    mark_ids: [],
  };
  let plan: ResolvedPlan;
  if (type === 'focused' || type === 'recheck')
    plan = await markedPlan(ctx, scope, type, input, base);
  else if (type === 'retry') plan = await retryPlan(ctx, scope, input, base);
  else plan = await continuePlan(ctx, input, base);
  if (plan.start_state_ids.length === 0)
    throw new ToolError(
      'NO_PATH',
      `nothing to start a ${type} run from: no marked screen or recorded state`,
    );
  const startPoints: StartPoint[] = [];
  for (const s of plan.start_state_ids) startPoints.push(await startPoint(ctx, scope, s));
  if (startPoints.every((p) => p.unreachable !== undefined))
    throw new ToolError('NO_PATH', 'no start point of this run can be reached by a recorded path', {
      start_points: startPoints,
    });
  return { plan, startPoints };
}

/** The marks a run used are closed by it (design §6: "cleared when it finishes"; Skip marks stay). */
export async function useMarks(ctx: ServerContext, markIds: readonly string[], runId: string) {
  if (markIds.length === 0) return;
  await ctx.db
    .updateTable('marks')
    .set({ used_by_run_id: runId, used_at: nowIso() })
    .where('id', 'in', [...markIds])
    .where('used_by_run_id', 'is', null)
    .execute();
}
