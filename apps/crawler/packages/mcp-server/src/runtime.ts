import type { ServerContext } from './context.js';
import type { StartRunOutput } from './services/start-run.js';
import type { RunRow } from './services/common.js';
import type { PreflightResult } from '@pathfinder/crawler';
import type { RunRobots } from './services/robots.js';

/** What `navigate`/`act` return (contracts/mcp-tools.md). */
export interface PageResult {
  state_id: string;
  created: boolean;
  cluster_id: string;
  title: string;
  route_template: string;
  forms: number;
  actions: {
    action_id: string;
    role: string;
    accessible_name: string | null;
    safety_class: string;
    allowed: boolean;
    skip_reason?: string;
    /**
     * Trace runs: the persona's `trace_inputs` value for this field's label, when declared. It is
     * what to type, NOT what the field holds: forms start as the portal renders them.
     */
    suggested_value?: string;
  }[];
  edge_id?: string;
  /** Trace runs: the step this call recorded. */
  step?: { ord: number; outcomes: string[] };
}

export interface NavigateInput {
  run_id: string;
  url: string;
  /** Required in trace runs. */
  intent?: string;
}

export interface ActInput {
  run_id: string;
  action_id: string;
  /** Required in trace runs. */
  intent?: string;
  /** Trace runs, fill/select actions only. */
  value?: string;
}

/**
 * The browser-owning half of the server, injected so the tool layer and the recording services are
 * testable without a browser. The real implementation (session, stabilizer, observer, action gate,
 * fingerprint, recording) lives in `runtime/`.
 */
export interface Runtime {
  /** Called after preflight and the run row exist; launches the browser session for the run. */
  openSession(
    ctx: ServerContext,
    run: RunRow,
    approved: Extract<PreflightResult, { ok: true }>,
    robots: RunRobots,
  ): Promise<void>;
  /** Live robots counters of an open session, for `finish_run` coverage. */
  robotsStats?(
    runId: string,
  ): { pageRequestsBlocked: number; pageRequestsAllowed: number } | undefined;
  navigate(ctx: ServerContext, input: NavigateInput): Promise<PageResult>;
  act(ctx: ServerContext, input: ActInput): Promise<PageResult>;
  /** Release the browser of a run that has ended (finished, stopped or interrupted). */
  closeRun?(runId: string): Promise<void>;
  closeAll(): Promise<void>;
}

export type { StartRunOutput };
