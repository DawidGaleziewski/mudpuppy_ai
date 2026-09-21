import { RunStatus, nowIso } from '@pathfinder/core';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { ToolError, parseInput } from '../errors.js';
import { computeCoverage, type Coverage } from '@pathfinder/crawler';
import { getRun, type RunRow } from './common.js';
import { isBudgetExhausted } from './run-budget.js';

function itemTemplatesOf(run: RunRow): string[] {
  try {
    return (
      (JSON.parse(run.config_snapshot) as { portal?: { item_route_templates?: string[] } }).portal
        ?.item_route_templates ?? []
    );
  } catch {
    return [];
  }
}

const CompleteRunInput = z
  .object({
    run_id: z.string().min(1),
    status: RunStatus.exclude(['running']),
    warning: z.string().min(1).nullable().default(null),
  })
  .strict();

/** Server-internal: computes coverage and sets the final status. The agent never calls this. */
export async function completeRun(ctx: ServerContext, raw: unknown) {
  const input = parseInput(CompleteRunInput, raw);
  const run = await getRun(ctx, input.run_id);
  if (input.status === 'stopped_warning' && input.warning === null) {
    throw new ToolError('SCHEMA_INVALID', 'warning is required when status is stopped_warning');
  }
  const coverage = await computeCoverage(ctx.db, run.id, itemTemplatesOf(run));
  await ctx.db
    .updateTable('runs')
    .set({
      status: input.status,
      warning: input.warning ?? run.warning,
      ended_at: nowIso(),
      coverage: JSON.stringify(coverage),
    })
    .where('id', '=', run.id)
    .execute();
  return { run_id: run.id, status: input.status, coverage };
}

/**
 * Agent-facing `finish_run`: only requests completion. The server verifies the frontier is empty or a
 * budget is exhausted; the agent can never set `status` or `warning`.
 */
export async function finishRun(ctx: ServerContext, raw: unknown) {
  const input = parseInput(
    z.object({ run_id: z.string().min(1), summary: z.string().max(4000).optional() }).strict(),
    raw,
  );
  const run = await getRun(ctx, input.run_id);
  if (run.status !== 'running') {
    // Already ended (block, earlier finish): report it, never change it.
    return {
      run_id: run.id,
      status: run.status,
      coverage: run.coverage
        ? (JSON.parse(run.coverage) as Coverage)
        : await computeCoverage(ctx.db, run.id, itemTemplatesOf(run)),
    };
  }
  const pending = await ctx.db
    .selectFrom('frontier')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('run_id', '=', run.id)
    .where('status', '=', 'pending')
    .executeTakeFirstOrThrow();
  if (Number(pending.n) > 0 && !(await isBudgetExhausted(ctx, run))) {
    throw new ToolError(
      'FRONTIER_NOT_EMPTY',
      `${Number(pending.n)} frontier items are still pending and no budget is exhausted`,
    );
  }
  return completeRun(ctx, { run_id: run.id, status: 'completed' });
}
