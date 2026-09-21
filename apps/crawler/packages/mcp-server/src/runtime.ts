import type { ServerContext } from './context.js';
import type { StartRunOutput } from './services/start-run.js';
import type { RunRow } from './services/common.js';
import type { PreflightResult } from '@pathfinder/crawler';

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
  }[];
  edge_id?: string;
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
  ): Promise<void>;
  navigate(ctx: ServerContext, input: { run_id: string; url: string }): Promise<PageResult>;
  act(ctx: ServerContext, input: { run_id: string; action_id: string }): Promise<PageResult>;
  /** Release the browser of a run that has ended (finished, stopped or interrupted). */
  closeRun?(runId: string): Promise<void>;
  closeAll(): Promise<void>;
}

export type { StartRunOutput };
