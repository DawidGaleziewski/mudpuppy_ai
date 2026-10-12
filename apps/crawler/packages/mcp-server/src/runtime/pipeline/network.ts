import { maskText } from '@pathfinder/core';
import type { ServerContext } from '../../context.js';
import { ToolError } from '../../errors.js';
import { recordApiCall, type RunRow } from '../../services/index.js';
import type { RunState } from '../run-state.js';
import { decision, fail, reported, type Report, type Reported } from './context.js';

/** Where the calls were observed: the action's edge (if any), the page's state, the portal's masking. */
export interface NetworkAt {
  edgeId: string | undefined;
  stateId: string;
  scrub: boolean;
}

/** The API calls observed for this page; a call that cannot be stored is a decision, not a failure. */
export async function recordNetwork(
  ctx: ServerContext,
  run: RunRow,
  net: Awaited<ReturnType<RunState['session']['recorder']['drain']>>,
  { edgeId, stateId: state_id, scrub }: NetworkAt,
): Promise<Reported<void>> {
  const reports: Report[] = [];
  for (const call of net.calls) {
    try {
      await recordApiCall(ctx, {
        run_id: run.id,
        edge_id: edgeId ?? null,
        ...call,
        // Verbatim unless the portal asks for masking (spec 019, research R2).
        url: scrub ? maskText(call.url) : call.url,
        console_errors: net.console_errors,
      });
    } catch (e) {
      if (!(e instanceof ToolError)) fail(reports, e);
      reports.push(
        decision({
          kind: 'refuse',
          rule: e.code,
          reason: `API call ${call.method} ${call.url_template} not recorded: ${e.message}`,
          subject_ref: state_id,
        }),
      );
    }
  }
  if (net.calls.length === 0 && net.console_errors.length > 0) {
    reports.push(
      decision({
        kind: 'warning',
        rule: 'console_errors',
        reason: `${net.console_errors.length} console error(s)/failed request(s) observed`,
        subject_ref: state_id,
        detail: { errors: net.console_errors },
      }),
    );
  }
  return reported(undefined, reports);
}
