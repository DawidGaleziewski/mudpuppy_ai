import type { Attrs, DecisionInput, EventName, PhaseName } from '@pathfinder/store';
import type { ServerContext } from '../../context.js';
import type { RunRow } from '../../services/index.js';
import type { StepKind } from '../../services/trace.js';
import { inPwGroup } from '../pw-trace.js';
import type { RunState } from '../run-state.js';
import type { ActionRow } from './actions.js';

/** A timed stage of the current tool call (contracts/trace-spans.md); untraced outside a call. */
export function phase<T>(ctx: ServerContext, name: PhaseName, fn: () => Promise<T>): Promise<T> {
  return ctx.tracer.phase(name, () => inPwGroup(name, fn));
}

/** Terminal styling Playwright puts in its error call logs. */
export const ANSI_STYLE = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, 'g');

/** A decision-log entry a step reports; `step()` adds the run id. */
export type Decision = Omit<DecisionInput, 'run_id'>;

/** One thing a step reports (G-18): a decision-log entry or a trace event. */
export type Report = { decision: Decision } | { event: EventName; attrs: Attrs };

/** What a step returns: its value and its reports, in the order they happened. */
export interface Reported<T> {
  value: T;
  reports: Report[];
}

export const decision = (d: Decision): Report => ({ decision: d });
export const event = (name: EventName, attrs: Attrs): Report => ({ event: name, attrs });
export const reported = <T>(value: T, reports: Report[] = []): Reported<T> => ({ value, reports });

/**
 * A step that fails after it already has something to report (a refusal's decision, the events
 * before a stop): `step()` writes the reports, then throws `error` on.
 */
export class ReportedFailure extends Error {
  constructor(
    readonly reports: Report[],
    readonly error: unknown,
  ) {
    super(error instanceof Error ? error.message : String(error));
  }
}

/** Throw `error` with the reports gathered so far (see `ReportedFailure`). */
export function fail(reports: Report[], error: unknown): never {
  if (error instanceof ReportedFailure)
    throw new ReportedFailure([...reports, ...error.reports], error.error);
  throw new ReportedFailure(reports, error);
}

/** Await `p`; if it throws, the reports gathered so far still get written. */
export async function orFail<T>(reports: Report[], p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    return fail(reports, e);
  }
}

/** Write reports in order: decisions to the decision log, events to the trace. */
export async function writeReports(
  ctx: ServerContext,
  runId: string,
  reports: readonly Report[],
): Promise<void> {
  for (const r of reports) {
    if ('decision' in r) await ctx.decisions.record({ run_id: runId, ...r.decision });
    else ctx.tracer.event(r.event, r.attrs);
  }
}

/** Where a step's reports go. `StepContext` and the tools' own call objects both fit. */
export interface StepScope {
  ctx: ServerContext;
  run: { id: string };
}

/**
 * A named, timed step of the pipeline (G-18): a `phase` span (and Playwright trace group) around
 * `fn`, which returns its reports instead of writing them; they are written inside the span, also
 * when `fn` fails with a `ReportedFailure`.
 */
export function step<T>(
  at: StepScope,
  name: PhaseName,
  fn: () => Promise<Reported<T>>,
): Promise<T> {
  return phase(at.ctx, name, async () => {
    let out: Reported<T>;
    try {
      out = await fn();
    } catch (e) {
      if (!(e instanceof ReportedFailure)) throw e;
      await writeReports(at.ctx, at.run.id, e.reports);
      throw e.error;
    }
    await writeReports(at.ctx, at.run.id, out.reports);
    return out.value;
  });
}

/** `event obstacle` for every dismissal since the last call (research §16); advances the cursor. */
export function obstacleReports(state: RunState): Report[] {
  const events = state.session.obstacles.events;
  const fresh = events.slice(state.obstacleCursor);
  state.obstacleCursor = events.length;
  return fresh.map((e) =>
    event('obstacle', { obstacle_id: e.id, selector: e.selector, via: e.via }),
  );
}

/** At the end of a tool call: the obstacles no step reported (handler-fired after the last settle). */
export function flushObstacles(ctx: ServerContext, state: RunState): Promise<void> {
  return writeReports(ctx, state.runId, obstacleReports(state));
}

/** Count the browser's requests for this call and emit their `request_aggregate` when it ends. */
export async function counted<T>(rs: RunState, fn: () => Promise<T>): Promise<T> {
  rs.trace.beginCall();
  try {
    return await (rs.pw ? rs.pw.chunk(fn) : fn());
  } finally {
    rs.trace.endCall();
  }
}

/** What a trace call adds to its step row; the server fills in everything it observed. */
export interface TraceStep {
  intent: string;
  kind: StepKind;
  action_id: string | null;
  value: string | null;
}

/**
 * Everything a step of `processPage` needs (G-04, G-18): one object instead of a growing list of
 * positional and optional parameters.
 */
export interface StepContext {
  ctx: ServerContext;
  run: RunRow;
  rs: RunState;
  /** How the browser got here: a navigation or an issued action. */
  via: { kind: 'navigate' } | { kind: 'act'; action: ActionRow };
  /** Depth of the page this call lands on. */
  depth: number;
  /** Trace runs: the step this call is, recorded once the page is observed. */
  step?: TraceStep;
  /** Where to return after a re-login when the session turns out expired (spec 009 FR-020). */
  reloginTarget?: string;
}
