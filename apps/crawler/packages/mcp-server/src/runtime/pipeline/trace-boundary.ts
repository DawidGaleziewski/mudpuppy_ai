import { maskText, newId, nowIso } from '@pathfinder/core';
import type { ServerContext } from '../../context.js';
import { ToolError } from '../../errors.js';
import { completeRun, type RunRow } from '../../services/index.js';
import { closeProcess, stepCount } from '../../services/trace.js';
import type { RunState } from '../run-state.js';
import type { decide } from '@pathfinder/crawler';
import type { ActionRow } from './actions.js';

/**
 * Close the trace at the first action the run may not execute (contracts/crawler-trace-tools.md):
 * process `boundary_reached` with what stays unobserved, a crawler open question about it, run
 * `completed`, a linked follow-up `blocked`, then TRACE_BOUNDARY_REACHED for the agent to report.
 */
export async function traceBoundary(
  ctx: ServerContext,
  run: RunRow,
  state: RunState,
  action: ActionRow,
  d: Extract<ReturnType<typeof decide>, { allowed: false }>,
): Promise<never> {
  const processId = state.processId!;
  const name = action.accessible_name ?? action.role;
  const cls = d.classification.safetyClass;
  const environment = state.effective.portal.environment;
  const notObservable = `What happens after '${name}'? Not observable: ${cls} on ${environment}`;
  await ctx.db
    .insertInto('open_questions')
    .values({
      id: newId(),
      run_id: run.id,
      text: maskText(notObservable),
      about_ref: action.state_id,
      status: 'open',
      created_at: nowIso(),
    })
    .execute();
  await closeProcess(ctx, processId, {
    outcome: 'boundary_reached',
    boundary_action_id: action.id,
    not_observable: notObservable,
    blocked_reason: `${d.rule}: ${d.reason}`,
  });
  await completeRun(ctx, { run_id: run.id, status: 'completed' }, state.session.gate.robotsStats());
  throw new ToolError(
    'TRACE_BOUNDARY_REACHED',
    `'${name}' is ${cls}, above what this run may execute on ${environment}; the trace stopped and the run is completed. Report the steps so far and stop.`,
    {
      process_id: processId,
      steps: await stepCount(ctx, processId),
      action: { role: action.role, name: action.accessible_name, safety_class: cls },
      rule: d.rule,
    },
  );
}
