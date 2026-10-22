/**
 * The tracer's vocabulary and public shapes (contracts/trace-spans.md): phase and event names, the
 * span handle, the `Tracer` interface. The writer is `createTracer` (`tracer.ts`).
 */
import type { Logger } from 'pino';
import type { EvidenceStore } from '@mudpuppy/core';
import type { SpanStatus, TraceLevel, TraceServer } from '@mudpuppy/trace';
import type { MudPuppyDb } from './db.js';

export const PHASE_NAMES = [
  'preflight',
  'resume_check',
  'robots_fetch',
  'insert_run',
  'open_session',
  'restore_index',
  'begin_step',
  'gate',
  'reach_state',
  'locate',
  'click',
  'goto',
  'settle',
  'observe',
  'net_drain',
  'fingerprint',
  // spec 039 (MudPuppy 2.0): the page's step result, builds and calls
  'model_capture',
  'record_state',
  'capture',
  'wireframe',
  'autofill',
  'record_forms',
  'record_transition',
  'record_api_calls',
  // spec 019 (R-37/R-38): the page's verbatim URL and the hops that led to it (`record_visit`
  // until spec 039 T110)
  'record_observation',
  'enqueue_frontier',
  'record_step',
  'run_bookkeeping',
  'complete_run',
  'pw_trace',
  // spec 009 (R-26): credentials and server-side login
  'resolve_credentials',
  'login',
  'relogin',
  // spec 023 (R-53): one per portal hook run; attrs say which point and function
  'hook',
  // spec 032 (R-69): back to a form step within the run; one try of a form probe
  'replay',
  'probe',
  // spec 038 (F-03): a new browser session for a probe try on a wizard that keeps its step on the server
  'fresh_session',
] as const;
export type PhaseName = (typeof PHASE_NAMES)[number];

export const EVENT_NAMES = [
  // spec 039: a page's step result, build scopes and call count; the model rebuilt after a run
  'model_capture',
  'model_reconciled',
  'gate_decision',
  'item_cap',
  'locator',
  'stabilization_timeout',
  'fingerprint_assign',
  'state_recorded',
  'visuals_captured',
  'capture_failed',
  'form_autofill',
  'frontier_enqueue',
  'frontier_skip',
  'frontier_pick',
  'request',
  'request_aggregate',
  'robots_check',
  'limiter_wait',
  'block_verdict',
  'run_stop',
  'run_status',
  'decision',
  'obstacle',
  'error',
  'trace_health',
  'concurrent_calls',
  // spec 009 (R-26)
  'handoff',
  'login',
  'relogin',
  // spec 013 (R-24): a link item settled by an earlier transition to the same target
  'frontier_infer',
  // spec 015 (R-28): frames, micro-frontend mounts, click signals
  'mfe_mount_timeout',
  'frame_skipped',
  'clickables_capped',
  // spec 019 (R-38): client-side redirects waited through, a slow refresh left alone, a loop capped
  'client_redirect',
  'observation',
  // spec 023 (R-53): the timeouts a page was given when the portal sets `timeouts`
  'page_timeouts',
  // spec 030 (R-60): an error page retried before observing; assets that failed to load
  'transient_error',
  'render_warning',
  // spec 032 (R-69): a state's form step and kind; a probe's outcome; a replay that diverged
  'form_step',
  'probe_outcome',
  'replay_diverged',
  // spec 038 (F-03): the session a probe try was redone in
  'fresh_session',
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** Calls that drive the run's page; Playwright callbacks attach to the open one (research §3). */
export const BROWSER_TOOLS: ReadonlySet<string> = new Set(['start_run', 'navigate', 'act']);

export type Attrs = Record<string, unknown>;

export interface TracerDeps {
  db: MudPuppyDb;
  logger: Logger;
  evidence: Pick<EvidenceStore, 'storeJson'>;
  level: TraceLevel;
  now?: () => Date;
  monotonic?: () => number;
  newId?: () => string;
  /** Between-calls events are flushed on this timer and at shutdown. */
  flushIntervalMs?: number;
}

export interface CallStart {
  tool: string;
  runId: string | null;
  args: unknown;
  meta?: Record<string, unknown>;
  requestId?: string | number;
  rationale?: string;
}

export interface SpanHandle {
  readonly id: string;
  setRunId(id: string): void;
  set(attrs: Attrs): void;
  setStatus(s: SpanStatus): void;
  setOutput(v: unknown): void;
  setSummary(s: string): void;
}

export interface CallInfo {
  readonly id: string;
  readonly seq: number;
  readonly name: string;
  readonly runId: string | null;
  /** Path of the call's Playwright trace, relative to `data/`. */
  setPwTracePath(path: string): void;
}

export interface EventOpts {
  status?: SpanStatus;
  summary?: string;
  decisionId?: string;
}

export interface TraceHealth {
  dropped: number;
  truncated: number;
}

export interface Tracer {
  readonly bootId: string;
  readonly level: TraceLevel;
  start(boot: { environment: string; server: TraceServer; version: string }): Promise<void>;
  sweepUnfinished(): Promise<number>;
  call<T>(c: CallStart, fn: (span: SpanHandle) => Promise<T>): Promise<T>;
  phase<T>(name: PhaseName, fn: (span: SpanHandle) => Promise<T>, attrs?: Attrs): Promise<T>;
  event(name: EventName, attrs: Attrs, opts?: EventOpts): void;
  eventForRun(runId: string, name: EventName, attrs: Attrs, opts?: EventOpts): void;
  /** True inside a still-open traced call's async context (where `event` attaches). */
  inCall(): boolean;
  /** The open call of the current async context (for per-call artefacts like Playwright traces). */
  currentCall(): CallInfo | undefined;
  /** Count a failure of trace-side work (e.g. a Playwright trace chunk) in the run's health. */
  countFailure(runId: string | null): void;
  health(runId: string): TraceHealth;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}
