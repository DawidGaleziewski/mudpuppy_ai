// `go_to_state` (spec 034 R-66, FR-002, A-2; design 11-map-runs §4 "replay is checked"): reach a
// recorded state again by replaying the recorded path, in one call. The owner's rule (2026-10-16):
// replay the path; a deep link only where a recorded visit showed the state opens directly, so a
// screen reachable only by UI navigation is reached by navigation, never by a URL that lands on an
// error page. Each hop goes through `navigate` / `act` with their gates, recording and hooks; pages
// on the way are recorded but not queued, and depth counts from the target (A-4).

import type { ServerContext } from '../../context.js';
import { ToolError } from '../../errors.js';
import type { GoToStateInput, GoToStateResult, PageResult } from '../../runtime.js';
import { resolveRecipe, type Recipe } from '../../services/checkpoints.js';
import { getRun } from '../../services/index.js';
import type { RunState } from '../run-state.js';
import { act } from './act.js';
import { navigate } from './navigate.js';

function diverged(target: string, atStep: number, expected: string, seen: string): ToolError {
  return new ToolError(
    'REPLAY_DIVERGED',
    `the recorded way to state ${target} diverged at step ${atStep}: expected state ${expected}, saw ${seen}. The page changed or depends on data; the screen can be rechecked or retried`,
    { target_state: target, at_step: atStep, expected_state: expected, seen_state: seen },
  );
}

/** This run's action on the current state that matches a recorded one (same role, name, nth). */
async function sameAction(
  ctx: ServerContext,
  runId: string,
  stateId: string,
  recordedId: string,
): Promise<{ id: string; stateOfRecorded: string } | null> {
  const recorded = await ctx.db
    .selectFrom('actions')
    .select(['state_id', 'role', 'accessible_name', 'action_json'])
    .where('id', '=', recordedId)
    .executeTakeFirst();
  if (recorded === undefined) return null;
  const nth = (JSON.parse(recorded.action_json) as { nth?: number }).nth ?? 0;
  const mine = await ctx.db
    .selectFrom('actions')
    .select(['id', 'action_json'])
    .where('run_id', '=', runId)
    .where('state_id', '=', stateId)
    .where('role', '=', recorded.role)
    .where((eb) =>
      recorded.accessible_name === null
        ? eb('accessible_name', 'is', null)
        : eb('accessible_name', '=', recorded.accessible_name),
    )
    .execute();
  const hit =
    mine.find((a) => ((JSON.parse(a.action_json) as { nth?: number }).nth ?? 0) === nth) ?? mine[0];
  return hit === undefined ? null : { id: hit.id, stateOfRecorded: recorded.state_id };
}

/** Walk the recipe; throws `REPLAY_DIVERGED` at the first hop that lands elsewhere. */
async function replay(
  ctx: ServerContext,
  rs: RunState,
  runId: string,
  recipe: Recipe,
): Promise<PageResult> {
  let page = await navigate(ctx, rs, { run_id: runId, url: recipe.start_url });
  for (const [i, s] of recipe.steps.entries()) {
    const action = await sameAction(ctx, runId, page.state_id, s.action_id);
    if (
      action === null ||
      (i === 0 && !(await sameScreen(ctx, action.stateOfRecorded, page.state_id)))
    )
      throw diverged(recipe.state_id, i, action?.stateOfRecorded ?? '-', page.state_id);
    page = await act(ctx, rs, {
      run_id: runId,
      action_id: action.id,
      ...(s.value !== null ? { value: s.value } : {}),
    });
    if (s.to_state !== null && !(await sameScreen(ctx, s.to_state, page.state_id)))
      throw diverged(recipe.state_id, i + 1, s.to_state, page.state_id);
  }
  if (!(await sameScreen(ctx, recipe.state_id, page.state_id)))
    throw diverged(recipe.state_id, recipe.steps.length, recipe.state_id, page.state_id);
  return page;
}

/** A state's screen: its route template and cluster. */
async function screenOf(ctx: ServerContext, stateId: string) {
  return ctx.db
    .selectFrom('states')
    .select(['route_template', 'cluster_id'])
    .where('id', '=', stateId)
    .executeTakeFirst();
}

/**
 * A hop lands right when it lands on the recorded screen, not necessarily the recorded state: a
 * page that shows typed values or a computed premium gets another fingerprint each time (field
 * finding of the first live replay, spec 034 F-05).
 */
async function sameScreen(ctx: ServerContext, expected: string, seen: string): Promise<boolean> {
  if (expected === seen) return true;
  const [a, b] = await Promise.all([screenOf(ctx, expected), screenOf(ctx, seen)]);
  return (
    a !== undefined &&
    b !== undefined &&
    a.route_template === b.route_template &&
    a.cluster_id === b.cluster_id
  );
}

export async function goToState(
  ctx: ServerContext,
  rs: RunState | undefined,
  input: GoToStateInput,
): Promise<GoToStateResult> {
  const run = await getRun(ctx, input.run_id);
  if (rs === undefined)
    throw new ToolError('RUN_NOT_FOUND', `run ${input.run_id} has no open browser session`);
  if (rs.isTrace)
    throw new ToolError('SCHEMA_INVALID', 'go_to_state is for map runs; a trace walks its process');
  const recipe = await resolveRecipe(
    ctx,
    { portal: run.portal_id, persona: run.persona_id },
    input.state_id,
  );
  const screen = await screenOf(ctx, input.state_id);
  rs.replay = {
    target: input.state_id,
    ...(screen ? { route: screen.route_template, cluster: screen.cluster_id } : {}),
  };
  let page: PageResult;
  try {
    page = await replay(ctx, rs, run.id, recipe);
  } finally {
    rs.replay = null;
  }
  // Depth counts from the start point (spec 034 A-4): its actions are one step deep.
  rs.depthByState.set(page.state_id, 0);
  if (rs.currentUrl !== null) rs.depthByUrl.set(rs.currentUrl, 0);
  return {
    ...page,
    reached: {
      state_id: page.state_id,
      how: recipe.how,
      replayed_steps: recipe.steps.length,
      from_run: recipe.from_run,
    },
  };
}
