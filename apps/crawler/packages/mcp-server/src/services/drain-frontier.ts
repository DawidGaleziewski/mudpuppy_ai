// `drain_frontier` (spec 080 FR-010, R-58's batch drain, D-3): the frontier's repetitive tail in one
// call. Field evidence: 148 of 165 crawler turns in one map were a refusal plus a frontier call, and
// most turns of a long map re-walk links to pages the run has already seen the like of. The agent
// asks the server to take up to ten pending read-only links to route templates the run already
// visited, one after another, each through `act` (gated, recorded, traced like the agent's own);
// the call stops at the first link that reaches a new state, at the first item that is not such a
// link (handed back as `next`, the agent's to decide), or at a refusal. The crawler stays the one
// agent that decides where to go; the server only does what the agent would do item by item.

import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { parseInput, ToolError } from '../errors.js';
import type { Runtime } from '../runtime.js';
import { assertRunActive } from './common.js';
import { getNextFrontierItem, type NextFrontierItem } from './frontier.js';
import { tiersOf } from './frontier-order.js';

export const DrainFrontierInput = z
  .object({
    run_id: z.string().min(1),
    max_items: z.number().int().min(1).max(10).default(10),
  })
  .strict();

export interface DrainResult {
  /** The items the server acted on, in order, and the state each reached. */
  drained: { frontier_id: string; description: string; state_id: string }[];
  /** Why it stopped. */
  stopped: 'new_state' | 'not_drainable' | 'empty' | 'budget_exhausted' | 'max_items' | 'refused';
  /** The item the agent decides on next; null when none is left. */
  next: NextFrontierItem['item'];
  /** A refusal's code and message, when `stopped` is `refused`. */
  refusal?: { code: string; message: string };
}

/** Whether the item is a pending read-only link to a route template the run already visited. */
function drainable(ctx: ServerContext, runId: string, frontierId: string): boolean {
  const row = ctx.raw
    .prepare('SELECT action_id, action_json, safety_class FROM frontier WHERE id = ?')
    .get(frontierId) as { action_id: string | null; action_json: string; safety_class: string };
  if (row.safety_class !== 'read' || row.action_id === null) return false;
  const visited = (
    ctx.raw.prepare('SELECT DISTINCT url FROM observations WHERE run_id = ?').all(runId) as {
      url: string;
    }[]
  ).map((r) => r.url);
  return tiersOf([row], visited)[0] === 2;
}

export async function drainFrontier(
  ctx: ServerContext,
  runtime: Pick<Runtime, 'act'>,
  raw: unknown,
): Promise<DrainResult> {
  const input = parseInput(DrainFrontierInput, raw);
  const run = await assertRunActive(ctx, input.run_id);
  if (run.mode !== 'map')
    throw new ToolError(
      'ACTION_REFUSED',
      'drain_frontier is for map runs; a trace walks its own process step by step',
    );
  const drained: DrainResult['drained'] = [];
  for (;;) {
    const next = await getNextFrontierItem(ctx, { run_id: input.run_id });
    if (next.item === null) return { drained, stopped: next.reason, next: null };
    if (drained.length >= input.max_items)
      return { drained, stopped: 'max_items', next: next.item };
    if (!drainable(ctx, input.run_id, next.item.frontier_id))
      return { drained, stopped: 'not_drainable', next: next.item };
    let page;
    try {
      page = await runtime.act(ctx, {
        run_id: input.run_id,
        action_id: next.item.action_id!,
      });
    } catch (e) {
      if (!(e instanceof ToolError)) throw e;
      const after = await getNextFrontierItem(ctx, { run_id: input.run_id });
      return {
        drained,
        stopped: 'refused',
        next: after.item,
        refusal: { code: e.code, message: e.message },
      };
    }
    drained.push({
      frontier_id: next.item.frontier_id,
      description: next.item.description,
      state_id: page.state_id,
    });
    if (page.created) {
      const after = await getNextFrontierItem(ctx, { run_id: input.run_id });
      return { drained, stopped: 'new_state', next: after.item };
    }
  }
}
