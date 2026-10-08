import type { ServerContext } from '../../context.js';
import { ToolError } from '../../errors.js';
import type { PageResult } from '../../runtime.js';
import { getNextFrontierItem } from '../../services/index.js';
import type { RunState } from '../run-state.js';

/**
 * A map run's result names the next frontier item, so the agent acts on it without a separate
 * `get_next_frontier_item` call (spec 013 US3). A trace has no frontier; a run that is no longer
 * active has no next item to name.
 */
export async function withNext(
  ctx: ServerContext,
  rs: RunState,
  runId: string,
  result: PageResult,
): Promise<PageResult> {
  if (rs.isTrace) return result;
  try {
    return { ...result, next: await getNextFrontierItem(ctx, { run_id: runId }) };
  } catch (e) {
    if (e instanceof ToolError) return result;
    throw e;
  }
}
