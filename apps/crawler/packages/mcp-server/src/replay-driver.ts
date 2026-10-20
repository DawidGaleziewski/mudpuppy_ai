// The headless driver (spec 039 design § 9): re-runs a recorded journey prefix through the crawler
// tools in-process, no LLM. Each step's action is found again by its model element key; forms are
// filled before their submit by map-mode autofill with the replay's inputs first. Every call is
// gated, recorded and traced like the agent's, and its transitions carry `driver = 'headless'`.
// A step it cannot find again ends the replay `diverged`: the test it serves is inconclusive.

import type { ToolCall, ToolReply } from './local-client.js';

/** One replay: where it starts, the clicks and submits in order, what it types. */
export interface ReplayPlan {
  portal: string;
  persona: string;
  environment: string;
  startUrl: string;
  /** Element keys of the recorded steps, in journey order. */
  steps: readonly string[];
  /** `input.<attribute>` → value. */
  inputs: Readonly<Record<string, string>>;
  /** Why this replay runs (the rationale every call carries). */
  purpose: string;
}

export type ReplayOutcome =
  | { status: 'reached'; runId: string; transitionId: string | null; stateId: string }
  | { status: 'diverged'; runId: string | null; atStep: number; reason: string };

interface Page {
  state_id?: string;
  transition_id?: string;
  actions?: { action_id: string; element_key?: string; allowed: boolean }[];
}

const messageOf = (r: ToolReply): string =>
  (r.body.error as { message?: string } | undefined)?.message ??
  JSON.stringify(r.body).slice(0, 200);

/** Run one plan in a new replay run; never throws for a refusal or a divergence. */
export async function replay(call: ToolCall, plan: ReplayPlan): Promise<ReplayOutcome> {
  const started = await call('start_run', {
    portal_id: plan.portal,
    persona_id: plan.persona,
    environment: plan.environment,
    replay: { inputs: plan.inputs },
  });
  if (started.isError)
    return { status: 'diverged', runId: null, atStep: 0, reason: messageOf(started) };
  const runId = started.body.run_id as string;
  const rationale = plan.purpose.slice(0, 300);
  const end = async <T extends ReplayOutcome>(outcome: T): Promise<T> => {
    await call('finish_run', { run_id: runId, rationale });
    return outcome;
  };
  let page = await call('navigate', {
    run_id: runId,
    url: plan.startUrl,
    rationale,
    include_actions: true,
  });
  if (page.isError)
    return end({ status: 'diverged', runId, atStep: 0, reason: `start: ${messageOf(page)}` });
  for (const [i, key] of plan.steps.entries()) {
    const body = page.body as Page;
    const action = body.actions?.find((a) => a.element_key === key);
    if (!action)
      return end({ status: 'diverged', runId, atStep: i + 1, reason: `no element ${key}` });
    page = await call('act', {
      run_id: runId,
      action_id: action.action_id,
      rationale,
      include_actions: true,
    });
    if (page.isError)
      return end({
        status: 'diverged',
        runId,
        atStep: i + 1,
        reason: `${key}: ${messageOf(page)}`,
      });
  }
  const last = page.body as Page;
  return end({
    status: 'reached',
    runId,
    transitionId: last.transition_id ?? null,
    stateId: last.state_id!,
  });
}
