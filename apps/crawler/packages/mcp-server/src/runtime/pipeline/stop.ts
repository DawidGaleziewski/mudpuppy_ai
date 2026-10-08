import { maskText } from '@pathfinder/core';
import { emitForRun } from '@pathfinder/store';
import type { ServerContext } from '../../context.js';
import { ToolError } from '../../errors.js';
import {
  assertRunActive,
  completeRun,
  isBudgetExhausted,
  type RunRow,
} from '../../services/index.js';
import { closeProcess } from '../../services/trace.js';
import type { RunState } from '../run-state.js';
import { event, reported, type Reported } from './context.js';

/** Persist a detected block: `stopped_warning`, a decision-log warning, and nothing more (FR-008). Idempotent. */
export function persistStop(ctx: ServerContext, rs: RunState, warning: string): Promise<void> {
  rs.stopPersisted ??= (async () => {
    emitForRun(ctx.tracer, rs.runId, 'run_stop', { warning: maskText(warning) });
    if (rs.processId)
      await closeProcess(ctx, rs.processId, { outcome: 'stopped', blocked_reason: warning });
    await completeRun(
      ctx,
      { run_id: rs.runId, status: 'stopped_warning', warning },
      rs.session.gate.robotsStats(),
    );
    await ctx.decisions.record({
      run_id: rs.runId,
      kind: 'warning',
      rule: 'block_detected',
      reason: warning,
    });
  })();
  return rs.stopPersisted;
}

export async function throwIfStopped(ctx: ServerContext, rs: RunState): Promise<void> {
  const stop = rs.session.gate.stopped;
  if (!stop) return;
  await persistStop(ctx, rs, stop.warning);
  throw new ToolError('RUN_STOPPED', stop.warning);
}

/** Guard applied at the start of every browser-touching tool. */
export async function beginStep(
  ctx: ServerContext,
  rs: RunState | undefined,
  runId: string,
): Promise<RunRow> {
  const run = await assertRunActive(ctx, runId);
  if (!rs)
    throw new ToolError(
      'RUN_STOPPED',
      `run ${runId} has no active browser session in this server; call start_run with resume_run_id`,
    );
  await throwIfStopped(ctx, rs);
  if (await isBudgetExhausted(ctx, run)) {
    if (rs.processId)
      await closeProcess(ctx, rs.processId, {
        outcome: 'stopped',
        blocked_reason: 'a step, time or state budget is exhausted',
      });
    await completeRun(ctx, { run_id: run.id, status: 'completed' }, rs.session.gate.robotsStats());
    throw new ToolError(
      'RUN_STOPPED',
      'a step, time or state budget is exhausted; the run has completed',
    );
  }
  return run;
}

/** The run's step, time and depth counters after a call, with its `event run_status`. */
export async function bumpRun(
  ctx: ServerContext,
  run: RunRow,
  startedAt: number,
  depth: number,
): Promise<Reported<void>> {
  const counters = {
    steps_used: run.steps_used + 1,
    elapsed_ms: run.elapsed_ms + (Date.now() - startedAt),
    max_depth_reached: Math.max(run.max_depth_reached, depth),
  };
  await ctx.db.updateTable('runs').set(counters).where('id', '=', run.id).execute();
  return reported(undefined, [event('run_status', { status: run.status, ...counters })]);
}
