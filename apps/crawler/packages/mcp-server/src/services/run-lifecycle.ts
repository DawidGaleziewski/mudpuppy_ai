import { nowIso } from '@pathfinder/core';
import type { ServerContext } from '../context.js';

/**
 * A run that is still `running` when the server (re)starts or shuts down has lost its browser: mark it
 * `interrupted` so it can be resumed from the persisted frontier without re-recording anything (FR-020).
 * Returns the ids it changed.
 */
export async function interruptStaleRuns(ctx: ServerContext): Promise<string[]> {
  const stale = await ctx.db
    .selectFrom('runs')
    .select('id')
    .where('status', '=', 'running')
    .execute();
  if (stale.length === 0) return [];
  await ctx.db
    .updateTable('runs')
    .set({ status: 'interrupted', ended_at: nowIso() })
    .where('status', '=', 'running')
    .execute();
  return stale.map((r) => r.id);
}

/** Mark one run `interrupted`, e.g. when its browser never started; it can be resumed later. */
export async function interruptRun(ctx: ServerContext, runId: string): Promise<void> {
  await ctx.db
    .updateTable('runs')
    .set({ status: 'interrupted', ended_at: nowIso() })
    .where('id', '=', runId)
    .where('status', '=', 'running')
    .execute();
}
