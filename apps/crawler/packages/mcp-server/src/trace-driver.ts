// The trace driver (spec 030 R-64, field pattern "03" — "I can't make the scanner finish a form
// process"): walks one `traces.yaml` entry through a trace run per variant, filling each field by
// its label, pressing the advance controls and the submit, so a form is driven to its end the same
// way every time. Safety stays the server's: the persona's limit decides whether the submit is
// pressed (a lower one ends the run at the boundary, honestly).

import type { TraceSpecEntry, TraceVariant } from '@mudpuppy/config';
import type { ToolCall, ToolReply } from './local-client.js';

export type DriveOutcome = 'goal_reached' | 'boundary_reached' | 'abandoned';

export interface DriveResult {
  trace: string;
  variant: string;
  runId: string | null;
  outcome: DriveOutcome;
  /** Steps acted (fills, clicks, the submit). */
  steps: number;
  /** Why the variant stopped short, when it did. */
  reason?: string;
}

interface Page {
  actions?: { action_id: string; accessible_name?: string | null }[];
}

const errorOf = (r: ToolReply): { code: string; message: string } =>
  (r.body.error as { code: string; message: string } | undefined) ?? {
    code: 'UNKNOWN',
    message: JSON.stringify(r.body).slice(0, 200),
  };

const actionNamed = (page: Page, name: string): string | undefined =>
  page.actions?.find((a) => a.accessible_name === name)?.action_id;

/** The `act` arguments of one planned step; a technical variant breaks its last action's request (spec 032 US3). */
function stepArgs(
  step: { intent: string; value?: string },
  variant: TraceVariant,
  last: boolean,
): Record<string, unknown> {
  return {
    intent: step.intent,
    include_actions: true,
    ...(step.value !== undefined ? { value: step.value } : {}),
    ...(variant.fault && last ? { fault: variant.fault } : {}),
  };
}

/** Run one variant of a trace; never throws for a refusal, it ends the variant with a reason. */
export async function driveVariant(
  call: ToolCall,
  run: { portal: string; persona: string; baseUrl: string },
  trace: TraceSpecEntry,
  variant: TraceVariant,
): Promise<DriveResult> {
  const result = (r: Omit<DriveResult, 'trace' | 'variant'>): DriveResult => ({
    trace: trace.id,
    variant: variant.id,
    ...r,
  });
  const started = await call('start_run', {
    portal_id: run.portal,
    persona_id: run.persona,
    mode: 'trace',
    process: { name: `${trace.name} (${variant.id})`, goal: trace.goal },
  });
  if (started.isError)
    return result({
      runId: null,
      outcome: 'abandoned',
      steps: 0,
      reason: errorOf(started).message,
    });
  const runId = started.body.run_id as string;
  const url = new URL(trace.start_url, run.baseUrl).toString();
  let page = await call('navigate', {
    run_id: runId,
    url,
    rationale: `trace ${trace.id}: open the start page`,
    intent: `open ${trace.name}`,
    include_actions: true,
  });
  let steps = 0;
  const finish = async (outcome: DriveOutcome, reason?: string): Promise<DriveResult> => {
    if (outcome !== 'boundary_reached')
      await call('finish_run', {
        run_id: runId,
        outcome: outcome === 'goal_reached' ? 'goal_reached' : 'abandoned',
        observed_result: reason ?? `variant ${variant.id} (${variant.expect}) driven to its end`,
        rationale: 'trace driver',
      });
    return result({ runId, outcome, steps, ...(reason ? { reason } : {}) });
  };
  if (page.isError) return finish('abandoned', `start page: ${errorOf(page).message}`);

  const plan = [
    ...(variant.steps ?? trace.steps).map((s) => ({ ...s })),
    ...trace.advance.map((name) => ({ name, kind: 'click' as const, intent: `move on (${name})` })),
    ...(trace.submit ? [{ name: trace.submit, kind: 'click' as const, intent: 'submit' }] : []),
  ];
  for (const [i, step] of plan.entries()) {
    const actionId = actionNamed(page.body, step.name);
    if (!actionId)
      return finish(
        variant.expect === 'validation_error' ? 'goal_reached' : 'abandoned',
        `no control named "${step.name}" on the page${variant.expect === 'validation_error' ? ' (the form stopped, as this variant expects)' : ''}`,
      );
    page = await call('act', {
      run_id: runId,
      action_id: actionId,
      rationale: `trace ${trace.id}`,
      ...stepArgs(step, variant, i === plan.length - 1),
    });
    if (page.isError) {
      const e = errorOf(page);
      if (e.code === 'TRACE_BOUNDARY_REACHED') return finish('boundary_reached', e.message);
      // A validation variant expects the form to stop (a disabled Next, a refused submit).
      if (variant.expect === 'validation_error')
        return finish(
          'goal_reached',
          `the form stopped at "${step.name}" as expected: ${e.message}`,
        );
      return finish('abandoned', `${step.name}: ${e.message}`);
    }
    steps++;
  }
  return finish('goal_reached');
}

/** Every variant of a trace, one run each; a stub (`to_be_discovered`) is skipped. */
export async function driveTrace(
  call: ToolCall,
  run: { portal: string; persona: string; baseUrl: string },
  trace: TraceSpecEntry,
  only?: string,
): Promise<DriveResult[]> {
  if (trace.to_be_discovered) return [];
  const out: DriveResult[] = [];
  for (const v of trace.variants.filter((x) => only === undefined || x.id === only))
    out.push(await driveVariant(call, run, trace, v));
  return out;
}
