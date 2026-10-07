import { nowIso } from '@pathfinder/core';
import type { RunOwner, ServerContext } from '../context.js';

/** Is the process with this id still alive? `EPERM` means it exists but belongs to someone else. */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** A running run is orphaned when no live server drives it: no owner recorded, or its process is gone. */
function orphaned(
  run: { owner_id: string | null; owner_pid: number | null },
  self: RunOwner,
  alive: (pid: number) => boolean,
): boolean {
  if (run.owner_pid === null) return true;
  // The same pid under another instance id is an earlier server of this process's slot: gone.
  if (run.owner_pid === self.pid) return run.owner_id !== self.id;
  return !alive(run.owner_pid);
}

/**
 * A run that is still `running` has lost its browser when the server driving it is gone: mark it
 * `interrupted` so it can be resumed from the persisted frontier without re-recording anything (FR-020).
 *
 * Several servers may share one store (a shell session and every chat session start their own, spec 010
 * F-14), so `startup` touches only orphaned runs and `shutdown` only the runs this server owns. A context
 * without an owner (tests, older callers) treats every running run as its own. Returns the ids it changed.
 */
export async function interruptStaleRuns(
  ctx: ServerContext,
  when: 'startup' | 'shutdown' = 'startup',
  alive: (pid: number) => boolean = processAlive,
): Promise<string[]> {
  const running = await ctx.db
    .selectFrom('runs')
    .select(['id', 'owner_id', 'owner_pid'])
    .where('status', '=', 'running')
    .execute();
  const self = ctx.owner;
  const stale = running.filter((r) =>
    self === undefined
      ? true
      : when === 'shutdown'
        ? r.owner_id === self.id
        : orphaned(r, self, alive),
  );
  if (stale.length === 0) return [];
  await ctx.db
    .updateTable('runs')
    .set({ status: 'interrupted', ended_at: nowIso() })
    .where('status', '=', 'running')
    .where(
      'id',
      'in',
      stale.map((r) => r.id),
    )
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

/** The owner columns a server writes when it starts or resumes a run; empty without an owner. */
export function ownerColumns(ctx: ServerContext): { owner_id?: string; owner_pid?: number } {
  return ctx.owner === undefined ? {} : { owner_id: ctx.owner.id, owner_pid: ctx.owner.pid };
}
