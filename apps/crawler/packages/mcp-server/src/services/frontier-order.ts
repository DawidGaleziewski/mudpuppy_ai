import { inferRouteTemplates } from '@pathfinder/fingerprint';
import type { ServerContext } from '../context.js';
import { linkTarget } from './same-target.js';

/**
 * Pick order of pending items (spec 026, owner: "order only"): 0 a plain link to a route template
 * this run has not visited, 1 an item with no link target (button, form, control, navigate), 2 a
 * plain link to a visited template. Nothing is skipped; within a tier the old order holds.
 */
export type FrontierTier = 0 | 1 | 2;

interface PendingRow {
  id: string;
  run_id: string;
  state_id: string;
  action_id: string | null;
  action_json: string;
  safety_class: string;
  priority: number;
  depth: number;
}

/** The URLs this run has visited. */
function visitedUrls(ctx: ServerContext, runId: string): string[] {
  const rows = ctx.raw
    .prepare('SELECT DISTINCT url FROM page_visits WHERE run_id = ?')
    .all(runId) as { url: string }[];
  return rows.map((r) => r.url);
}

/**
 * Tier of each row. The templates are inferred over the visited URLs and every pending link
 * target together (FR-002): a catalogue's many product links collapse into one template as soon
 * as they are queued, not only after the run has visited more than ten of them.
 */
export function tiersOf(
  rows: readonly Pick<PendingRow, 'action_id' | 'action_json'>[],
  visited: readonly string[],
): FrontierTier[] {
  const targets = rows.map((r) => linkTarget(r));
  const templater = inferRouteTemplates([
    ...visited,
    ...targets.filter((t): t is string => t !== null),
  ]);
  const seen = new Set(visited.map((u) => templater.templateFor(u)));
  return targets.map((t) => {
    if (t === null) return 1;
    return seen.has(templater.templateFor(t)) ? 2 : 0;
  });
}

/** The next pending row and its tier: the lowest tier, then highest priority, then oldest id. */
export async function nextPendingRow(
  ctx: ServerContext,
  runId: string,
): Promise<{ row: PendingRow; tier: FrontierTier } | undefined> {
  const rows = await ctx.db
    .selectFrom('frontier')
    .selectAll()
    .where('run_id', '=', runId)
    .where('status', '=', 'pending')
    .orderBy('priority', 'desc')
    .orderBy('id', 'asc')
    .execute();
  const tiers = tiersOf(rows, visitedUrls(ctx, runId));
  let best: { row: PendingRow; tier: FrontierTier } | undefined;
  rows.forEach((row, i) => {
    const tier = tiers[i]!;
    if (!best || tier < best.tier) best = { row, tier };
  });
  return best;
}
