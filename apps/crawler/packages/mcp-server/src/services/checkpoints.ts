// Checkpoints (spec 034 R-66, FR-001, A-1; design 11-map-runs §4): the recorded way back to a state.
// Every run stores, per state it reached by navigate or act, the shortest path it took (the URL of
// the last navigate and the acted steps with their values), so a later run can replay it. Runs from
// before checkpoints existed fall back to a path rebuilt from their page visits and edges.

import { newId, nowIso } from '@pathfinder/core';
import type { ServerContext } from '../context.js';
import { ToolError } from '../errors.js';

export interface RecipeStep {
  /** The action as recorded in the checkpoint's run (its row describes the element to find). */
  action_id: string;
  value: string | null;
  fills?: { name: string; kind: 'fill' | 'select' | 'check'; value?: string }[];
  /** The state the step must land on; null when the rebuilt path does not know it. */
  to_state: string | null;
}

export interface Recipe {
  state_id: string;
  start_url: string;
  steps: RecipeStep[];
  /** `deep_link`: a recorded visit opened the state by its URL; else replayed steps. */
  how: 'deep_link' | 'checkpoint' | 'rebuilt';
  from_run: string;
}

interface PathLike {
  url: string;
  steps: {
    actionId: string;
    value: string | null;
    fills?: RecipeStep['fills'];
    toState?: string;
  }[];
}

/** Store the run's path to a state, unless the run already stored one at most as long. */
export async function saveCheckpoint(
  ctx: ServerContext,
  runId: string,
  stateId: string,
  path: PathLike | undefined,
): Promise<void> {
  if (path === undefined) return;
  const steps: RecipeStep[] = path.steps.map((s) => ({
    action_id: s.actionId,
    value: s.value,
    ...(s.fills && s.fills.length > 0 ? { fills: s.fills } : {}),
    to_state: s.toState ?? null,
  }));
  const known = await ctx.db
    .selectFrom('checkpoints')
    .select(['id', 'steps_json'])
    .where('run_id', '=', runId)
    .where('state_id', '=', stateId)
    .executeTakeFirst();
  const at = nowIso();
  if (known === undefined) {
    await ctx.db
      .insertInto('checkpoints')
      .values({
        id: newId(),
        run_id: runId,
        state_id: stateId,
        start_url: path.url,
        steps_json: JSON.stringify(steps),
        created_at: at,
        updated_at: at,
      })
      .execute();
    return;
  }
  if ((JSON.parse(known.steps_json) as unknown[]).length <= steps.length) return;
  await ctx.db
    .updateTable('checkpoints')
    .set({ start_url: path.url, steps_json: JSON.stringify(steps), updated_at: at })
    .where('id', '=', known.id)
    .execute();
}

/** Checkpoints of the state from runs of this portal and persona, shortest first, newest on ties. */
async function checkpointsOf(
  ctx: ServerContext,
  portal: string,
  persona: string,
  stateId: string,
): Promise<{ run_id: string; start_url: string; steps: RecipeStep[] }[]> {
  const rows = await ctx.db
    .selectFrom('checkpoints as c')
    .innerJoin('runs as r', 'r.id', 'c.run_id')
    .select(['c.run_id', 'c.start_url', 'c.steps_json', 'c.updated_at'])
    .where('c.state_id', '=', stateId)
    .where('r.portal_id', '=', portal)
    .where('r.persona_id', '=', persona)
    .execute();
  return rows
    .map((r) => ({
      run_id: r.run_id,
      start_url: r.start_url,
      steps: JSON.parse(r.steps_json) as RecipeStep[],
      at: r.updated_at,
    }))
    .sort((a, b) => a.steps.length - b.steps.length || b.at.localeCompare(a.at));
}

/** A visit that opened the state straight from its URL (a navigate, not a click). */
async function directVisit(
  ctx: ServerContext,
  portal: string,
  persona: string,
  stateId: string,
): Promise<{ run_id: string; url: string } | undefined> {
  return ctx.db
    .selectFrom('page_visits as v')
    .innerJoin('runs as r', 'r.id', 'v.run_id')
    .select(['v.run_id', 'v.url'])
    .where('v.state_id', '=', stateId)
    .where('v.via', '=', 'navigate')
    .where('r.portal_id', '=', portal)
    .where('r.persona_id', '=', persona)
    .orderBy('v.created_at', 'desc')
    .limit(1)
    .executeTakeFirst();
}

const MAX_REBUILT_STEPS = 30;

/**
 * A path rebuilt from a run's page visits (runs recorded before checkpoints): from the visit of the
 * state back along the edges that led to it, to the last navigate. Values are not known; the
 * replay types the persona's test data, as a map run does.
 */
async function rebuiltPath(
  ctx: ServerContext,
  portal: string,
  persona: string,
  stateId: string,
): Promise<{ run_id: string; start_url: string; steps: RecipeStep[] } | undefined> {
  const visits = await ctx.db
    .selectFrom('page_visits as v')
    .innerJoin('runs as r', 'r.id', 'v.run_id')
    .leftJoin('edges as e', 'e.id', 'v.edge_id')
    .select(['v.run_id', 'v.state_id', 'v.via', 'v.url', 'v.created_at', 'e.from_state'])
    .select(['e.action_json'])
    .where('r.portal_id', '=', portal)
    .where('r.persona_id', '=', persona)
    .orderBy('v.created_at')
    .execute();
  const runs = [...new Set(visits.filter((v) => v.state_id === stateId).map((v) => v.run_id))];
  for (const run of runs.reverse()) {
    const own = visits.filter((v) => v.run_id === run);
    const steps: RecipeStep[] = [];
    let at = own.findLastIndex((v) => v.state_id === stateId);
    while (at >= 0 && steps.length <= MAX_REBUILT_STEPS) {
      const v = own[at]!;
      if (v.via === 'navigate' || v.via === 'login')
        return { run_id: run, start_url: v.url, steps: steps.reverse() };
      if (v.via !== 'action' || v.from_state === null) break;
      const actionId = await actionOfEdge(ctx, run, v.from_state, v.action_json);
      if (actionId === null) break;
      steps.push({ action_id: actionId, value: null, to_state: v.state_id });
      const from = v.from_state;
      at = own.slice(0, at).findLastIndex((w) => w.state_id === from);
    }
  }
  return undefined;
}

/** The run's action an edge executed: an edge stores the action's role and name, not its id. */
async function actionOfEdge(
  ctx: ServerContext,
  runId: string,
  fromState: string,
  actionJson: string | null,
): Promise<string | null> {
  if (actionJson === null) return null;
  let described: { role?: unknown; accessible_name?: unknown };
  try {
    described = JSON.parse(actionJson) as typeof described;
  } catch {
    return null;
  }
  if (typeof described.role !== 'string') return null;
  const name = typeof described.accessible_name === 'string' ? described.accessible_name : null;
  const row = await ctx.db
    .selectFrom('actions')
    .select('id')
    .where('run_id', '=', runId)
    .where('state_id', '=', fromState)
    .where('role', '=', described.role)
    .where((eb) =>
      name === null ? eb('accessible_name', 'is', null) : eb('accessible_name', '=', name),
    )
    .limit(1)
    .executeTakeFirst();
  return row?.id ?? null;
}

/**
 * How to reach a recorded state again as this persona (owner 2026-10-16: replay the recorded path;
 * a deep link only where a recorded visit showed the state opens directly). `NO_PATH` when no run
 * of this persona has a way there.
 */
export async function resolveRecipe(
  ctx: ServerContext,
  scope: { portal: string; persona: string },
  stateId: string,
): Promise<Recipe> {
  const { portal, persona } = scope;
  const direct = await directVisit(ctx, portal, persona, stateId);
  if (direct !== undefined)
    return {
      state_id: stateId,
      start_url: direct.url,
      steps: [],
      how: 'deep_link',
      from_run: direct.run_id,
    };
  const [best] = await checkpointsOf(ctx, portal, persona, stateId);
  if (best !== undefined)
    return {
      state_id: stateId,
      start_url: best.start_url,
      steps: best.steps,
      how: best.steps.length === 0 ? 'deep_link' : 'checkpoint',
      from_run: best.run_id,
    };
  const rebuilt = await rebuiltPath(ctx, portal, persona, stateId);
  if (rebuilt !== undefined)
    return { state_id: stateId, ...rebuilt, how: 'rebuilt', from_run: rebuilt.run_id };
  throw new ToolError(
    'NO_PATH',
    `no recorded way to state ${stateId} as persona ${persona}: map the portal as this persona first`,
    { state_id: stateId, persona },
  );
}
