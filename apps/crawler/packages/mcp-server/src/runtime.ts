import type { ServerContext } from './context.js';
import type { StartRunOutput } from './services/start-run.js';
import type { RunRow } from './services/common.js';
import type { PreflightResult } from '@pathfinder/crawler';
import type { ProbeFault } from '@pathfinder/core';
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
     * Trace runs: the persona's `test_data` value for this field's label, when declared. It is
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

export type LoginResult = PageResult & {
  outcome: 'logged_in' | 'failed' | 'pending';
  reason?: string;
};

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
  /** Trace runs (spec 032 suites): break the request this action sends, in the browser only. */
  fault?: ProbeFault;
  /** Return the page's actions even when the run already knows the state. */
  include_actions?: boolean;
}

/** `go_to_state` (spec 034 R-66): a recorded state to reach again by replay. */
export interface GoToStateInput {
  run_id: string;
  state_id: string;
}

/** The target page, and how it was reached (`deep_link`, a stored `checkpoint`, a `rebuilt` path). */
export type GoToStateResult = PageResult & {
  reached: {
    state_id: string;
    how: 'deep_link' | 'checkpoint' | 'rebuilt';
    replayed_steps: number;
    from_run: string;
  };
};

/** `probe_form` (spec 032 US2): the form step's submit or advance control, and the probes to try. */
export interface ProbeFormInput {
  run_id: string;
  action_id: string;
  /** Probe ids or groups (`validation`, `branch`, `technical`); absent = the whole catalogue. */
  probes?: string[];
}

/** What `probe_form` returns: compact, the outcomes are in the store (spec 013: few tokens). */
export interface ProbeFormResult {
  form_step: { id: string; step_index: number; label: string } | null;
  outcomes: {
    probe: string;
    key: string;
    target: string | null;
    outcome_kind: string;
    to_state: string;
    messages: string[];
    accepted?: true;
    possible_new_process?: true;
  }[];
  /** Tries not run, with the reason (budget, no request to break, the way back diverged). */
  skipped: string[];
  /** Tries left when the call reached its time limit: call `probe_form` again to continue. */
  more?: number;
  /** The happy values did not pass the step: these labels need test data (O-M3). */
  missing_test_data?: string[];
  /** Why the step could not be probed at all (the limit, a one-time code). */
  blocked?: string;
  budget: { per_step: number; per_run: number; used_in_run: number };
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
  /** Form probes (spec 032); optional so browserless test runtimes need not. */
  probeForm?(ctx: ServerContext, input: ProbeFormInput): Promise<ProbeFormResult>;
  /** Replay the recorded path to a state (spec 034 R-66); optional for browserless test runtimes. */
  goToState?(ctx: ServerContext, input: GoToStateInput): Promise<GoToStateResult>;
  /** Server-side login from the vault (spec 009); optional so browserless test runtimes need not. */
  login?(ctx: ServerContext, input: { run_id: string }): Promise<LoginResult>;
  /** Release the browser of a run that has ended (finished, stopped or interrupted). */
  closeRun?(runId: string): Promise<void>;
  closeAll(): Promise<void>;
}

export type { StartRunOutput };
