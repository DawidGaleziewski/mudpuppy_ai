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

/**
 * Cheap starts (design § 9, spec 040 T032): where earlier replays of the same call got to, by
 * (persona, inputs, prefix of element keys). A later plan with the same prefix opens the page
 * there by its address and goes on with the rest of its steps, once the page is the same state;
 * if not, it replays from the start as before. The last step is never skipped.
 */
export interface PrefixCache {
  /** The address a run's page of `stateId` was observed under (the store's observations). */
  urlOf: (runId: string, stateId: string) => string | null;
  reached: Map<string, { url: string; stateId: string }>;
  /** Steps not replayed thanks to the cache. */
  saved: number;
}

export const prefixCache = (urlOf: PrefixCache['urlOf']): PrefixCache => ({
  urlOf,
  reached: new Map(),
  saved: 0,
});

const prefixKey = (plan: ReplayPlan, n: number): string =>
  JSON.stringify([
    plan.portal,
    plan.persona,
    plan.startUrl,
    Object.entries(plan.inputs).sort(([a], [b]) => a.localeCompare(b)),
    plan.steps.slice(0, n),
  ]);

/** The longest cached prefix shorter than the plan, if any. */
function cachedStart(cache: PrefixCache | undefined, plan: ReplayPlan) {
  for (let n = plan.steps.length - 1; cache && n > 0; n--) {
    const hit = cache.reached.get(prefixKey(plan, n));
    if (hit) return { n, ...hit };
  }
  return null;
}

/** The first page: at the longest cached prefix when it is still that state, else the start. */
async function start(
  open: (url: string) => Promise<ToolReply>,
  plan: ReplayPlan,
  cache: PrefixCache | undefined,
): Promise<{ page: ToolReply; from: number }> {
  const hit = cachedStart(cache, plan);
  if (hit) {
    const page = await open(hit.url);
    if (!page.isError && (page.body as Page).state_id === hit.stateId) {
      cache!.saved += hit.n;
      return { page, from: hit.n };
    }
  }
  return { page: await open(plan.startUrl), from: 0 };
}

/** After `n` steps: where the run is, for later plans with the same prefix (never the last). */
function remember(
  cache: PrefixCache | undefined,
  plan: ReplayPlan,
  n: number,
  runId: string,
  stateId: string | undefined,
): void {
  if (!cache || !stateId || n >= plan.steps.length) return;
  const url = cache.urlOf(runId, stateId);
  if (url) cache.reached.set(prefixKey(plan, n), { url, stateId });
}

/** Run one plan in a new probe run; never throws for a refusal or a divergence. */
export async function replay(
  call: ToolCall,
  plan: ReplayPlan,
  cache?: PrefixCache,
): Promise<ReplayOutcome> {
  const started = await call('start_run', {
    portal_id: plan.portal,
    persona_id: plan.persona,
    environment: plan.environment,
    mode: 'probe',
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
  const open = (url: string) =>
    call('navigate', { run_id: runId, url, rationale, include_actions: true });
  const first = await start(open, plan, cache);
  const from = first.from;
  let page = first.page;
  if (page.isError)
    return end({ status: 'diverged', runId, atStep: 0, reason: `start: ${messageOf(page)}` });
  for (const [i, key] of plan.steps.entries()) {
    if (i < from) continue;
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
    remember(cache, plan, i + 1, runId, (page.body as Page).state_id);
  }
  const last = page.body as Page;
  return end({
    status: 'reached',
    runId,
    transitionId: last.transition_id ?? null,
    stateId: last.state_id!,
  });
}
