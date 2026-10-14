import type { ServerContext } from './context.js';
import type { StartRunOutput } from './services/start-run.js';
import type { RunRow } from './services/common.js';
import type { PreflightResult } from '@pathfinder/crawler';
import type { LoadedHook } from '@pathfinder/hooks';
import type { RunRobots } from './services/robots.js';
import type { NextFrontierItem } from './services/frontier.js';

/** What `navigate`/`act` return (contracts/mcp-tools.md). */
export interface PageResult {
  state_id: string;
  created: boolean;
  cluster_id: string;
  title: string;
  route_template: string;
  forms: number;
  /**
   * The page's issued actions. Left out in map runs when the run already observed this state
   * (its items are on the frontier) unless `include_actions` asked for them (spec 013 US1).
   */
  actions?: {
    action_id: string;
    role: string;
    accessible_name: string | null;
    safety_class: string;
    allowed: boolean;
    skip_reason?: string;
    /** Role-less clickables only: the click signals that found the element (spec 015). */
    found_by?: string[];
    /**
     * Trace runs: the persona's `trace_inputs` value for this field's label, when declared. It is
     * what to type, NOT what the field holds: forms start as the portal renders them.
     */
    suggested_value?: string;
  }[];
  /** How many issued actions a result without `actions` left out. */
  actions_omitted?: number;
  /** Map runs: the item `get_next_frontier_item` would return now; act on it next (spec 013 US3). */
  next?: NextFrontierItem;
  edge_id?: string;
  /** Trace runs: the step this call recorded. */
  step?: { ord: number; outcomes: string[] };
  /** The session had expired; the server logged in again and returned here (spec 009). */
  relogged_in?: true;
  /** Frames whose content is part of this page (spec 015); omitted when none. */
  frames?: number;
  /** Micro-frontend mount points still empty when the wait ran out (spec 015); worth one re-navigate. */
  mounts_pending?: string[];
}

export type LoginResult = PageResult & { outcome: 'logged_in' | 'failed'; reason?: string };

export interface NavigateInput {
  run_id: string;
  url: string;
  /** Required in trace runs. */
  intent?: string;
  /** Return the page's actions even when the run already knows the state. */
  include_actions?: boolean;
}

export interface ActInput {
  run_id: string;
  action_id: string;
  /** Required in trace runs. */
  intent?: string;
  /** Trace runs, fill/select actions only. */
  value?: string;
  /** Return the page's actions even when the run already knows the state. */
  include_actions?: boolean;
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
    /** `hooks`: the portal's loaded hooks (spec 023); absent in browserless test runtimes. */
    approved: Extract<PreflightResult, { ok: true }> & { hooks?: readonly LoadedHook[] },
    robots: RunRobots,
  ): Promise<void>;
  /** Live robots counters of an open session, for `finish_run` coverage. */
  robotsStats?(
    runId: string,
  ): { pageRequestsBlocked: number; pageRequestsAllowed: number } | undefined;
  navigate(ctx: ServerContext, input: NavigateInput): Promise<PageResult>;
  act(ctx: ServerContext, input: ActInput): Promise<PageResult>;
  /** Server-side login from the vault (spec 009); optional so browserless test runtimes need not. */
  login?(ctx: ServerContext, input: { run_id: string }): Promise<LoginResult>;
  /** Release the browser of a run that has ended (finished, stopped or interrupted). */
  closeRun?(runId: string): Promise<void>;
  closeAll(): Promise<void>;
}

export type { StartRunOutput };
