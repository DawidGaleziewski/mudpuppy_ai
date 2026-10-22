import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import { newId as defaultNewId } from '@mudpuppy/core';
import { fitText } from '@mudpuppy/trace';
import {
  callExtra,
  emitErrorOnce,
  end,
  flush,
  flushCall,
  handleFor,
  healthOf,
  iso,
  makeEvent,
  newSpan,
  NOOP_HANDLE,
  queueBetween,
  register,
  rowOf,
  safeWrite,
  statusFor,
  track,
  unregister,
  type CallRec,
  type Ctx,
  type TraceCore,
} from './tracer-core.js';
import type {
  Attrs,
  CallInfo,
  CallStart,
  EventName,
  EventOpts,
  PhaseName,
  SpanHandle,
  Tracer,
  TracerDeps,
} from './tracer-types.js';

/** Emit inside the current call when there is one, else under the run's open browser call. */
export function emitForRun(
  tracer: Tracer,
  runId: string,
  name: EventName,
  attrs: Attrs,
  opts?: EventOpts,
): void {
  if (tracer.inCall()) tracer.event(name, attrs, opts);
  else tracer.eventForRun(runId, name, attrs, opts);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** The call's run id, or null with `unknown_run_id` in its attrs when no such run exists. */
async function knownRun(core: TraceCore, runId: string | null, attrs: Attrs) {
  if (!runId) return runId;
  try {
    const exists = await core.db
      .selectFrom('runs')
      .select('id')
      .where('id', '=', runId)
      .executeTakeFirst();
    if (!exists) {
      attrs.unknown_run_id = runId;
      return null;
    }
  } catch {
    /* store unreadable: the insert below will fail and be counted */
  }
  return runId;
}

async function openCall(core: TraceCore, c: CallStart): Promise<CallRec> {
  const attrs: Attrs = { args: c.args };
  if (c.requestId !== undefined) attrs.request_id = c.requestId;
  const agentType = str(c.meta?.['claudecode/agentType']);
  if (agentType) attrs.agent_type = agentType;
  const runId = await knownRun(core, c.runId, attrs);
  const call: CallRec = {
    ...newSpan(core, 'call', c.tool, null, attrs),
    runId,
    children: [],
    toolUseId: str(c.meta?.['claudecode/toolUseId']),
    agentId: str(c.meta?.['claudecode/agentId']),
    rationale: c.rationale ? fitText(c.rationale, 300).text : null,
    pwTracePath: null,
    output: null,
    inserted: false,
    closed: false,
    registered: false,
  };
  const start = await rowOf(core, call, runId, call.attrs, callExtra(call));
  call.inserted = await safeWrite(core, { runId, rows: 1, what: 'call start' }, () =>
    core.db.insertInto('trace_spans').values(start.row).execute(),
  );
  register(core, call);
  return call;
}

async function traceCall<T>(
  core: TraceCore,
  c: CallStart,
  fn: (span: SpanHandle) => Promise<T>,
): Promise<T> {
  const call = await openCall(core, c);
  const handle = handleFor(core, call, call);
  try {
    const result = await core.als.run({ call, span: call }, () => fn(handle));
    end(core, call, call.explicitStatus ?? 'ok');
    return result;
  } catch (e) {
    end(core, call, statusFor(e));
    emitErrorOnce(core, call, call, e);
    throw e;
  } finally {
    call.closed = true;
    unregister(core, call);
    await track(core, flushCall(core, call));
  }
}

async function tracePhase<T>(
  core: TraceCore,
  name: PhaseName,
  fn: (span: SpanHandle) => Promise<T>,
  attrs?: Attrs,
): Promise<T> {
  const ctx = core.als.getStore();
  // Services also run outside a tool call (direct tests, scripts): run untraced.
  if (!ctx || ctx.call.closed) return fn(NOOP_HANDLE);
  if (!core.recording) return fn(NOOP_HANDLE);
  const span = newSpan(core, 'phase', name, ctx.span.id, attrs);
  ctx.call.children.push(span);
  try {
    const result = await core.als.run({ call: ctx.call, span }, () =>
      fn(handleFor(core, span, ctx.call)),
    );
    end(core, span, span.explicitStatus ?? 'ok');
    return result;
  } catch (e) {
    end(core, span, statusFor(e));
    emitErrorOnce(core, ctx.call, span, e);
    throw e;
  }
}

function eventForRun(
  core: TraceCore,
  runId: string,
  event: { name: EventName; attrs: Attrs; opts?: EventOpts },
): void {
  if (!core.recording) return;
  const open = core.openByRun.get(runId);
  const target = open?.[open.length - 1];
  if (!open || !target) {
    queueBetween(core, runId, event);
    return;
  }
  const withOverlap =
    open.length > 1
      ? { ...event.attrs, overlapping_calls: open.filter((c) => c !== target).map((c) => c.id) }
      : event.attrs;
  target.children.push(makeEvent(core, event.name, target.id, withOverlap, event.opts));
}

function traceEvent(core: TraceCore, name: EventName, attrs: Attrs, opts?: EventOpts): void {
  if (!core.recording) return;
  const ctx = core.als.getStore();
  if (!ctx) {
    healthOf(core, null).dropped += 1;
    return;
  }
  if (ctx.call.closed) {
    // A callback still carrying a finished call's context (e.g. Playwright's connection was
    // opened inside start_run): route it like a browser callback.
    if (ctx.call.runId) eventForRun(core, ctx.call.runId, { name, attrs, opts });
    else healthOf(core, null).dropped += 1;
    return;
  }
  ctx.call.children.push(makeEvent(core, name, ctx.span.id, attrs, opts));
}

function currentCall(core: TraceCore): CallInfo | undefined {
  const ctx = core.als.getStore();
  if (!ctx || ctx.call.closed) return undefined;
  const call = ctx.call;
  return {
    id: call.id,
    seq: call.seq,
    name: call.name,
    runId: call.runId,
    setPwTracePath(path: string) {
      call.pwTracePath = path;
    },
  };
}

async function startBoot(core: TraceCore, boot: Parameters<Tracer['start']>[0], deps: TracerDeps) {
  await safeWrite(core, { runId: null, rows: 1, what: 'boot' }, () =>
    core.db
      .insertInto('trace_boots')
      .values({
        id: core.bootId,
        started_at: iso(core),
        ended_at: null,
        environment: boot.environment,
        server: boot.server,
        pid: process.pid,
        version: boot.version,
        trace_level: deps.level,
        // Every environment is traced since spec 021; the column keeps old boots readable.
        pw_trace: 'all',
      })
      .execute(),
  );
}

async function sweepUnfinished(core: TraceCore): Promise<number> {
  let n = 0;
  await safeWrite(core, { runId: null, rows: 0, what: 'sweep' }, async () => {
    const res = await core.db
      .updateTable('trace_spans')
      .set({ status: 'unfinished' })
      .where('status', '=', 'running')
      .where('boot_id', '<>', core.bootId)
      .executeTakeFirst();
    n = Number(res.numUpdatedRows);
  });
  return n;
}

async function shutdown(core: TraceCore): Promise<void> {
  await Promise.allSettled([...core.inflight]);
  await flush(core);
  await safeWrite(core, { runId: null, rows: 0, what: 'boot end' }, () =>
    core.db
      .updateTable('trace_boots')
      .set({ ended_at: iso(core) })
      .where('id', '=', core.bootId)
      .execute(),
  );
}

function coreOf(deps: TracerDeps): TraceCore {
  const newId = deps.newId ?? (() => defaultNewId());
  return {
    db: deps.db,
    logger: deps.logger,
    evidence: deps.evidence,
    recording: deps.level !== 'off',
    now: deps.now ?? (() => new Date()),
    monotonic: deps.monotonic ?? (() => performance.now()),
    newId,
    flushIntervalMs: deps.flushIntervalMs ?? 1000,
    bootId: newId(),
    als: new AsyncLocalStorage<Ctx>(),
    openByRun: new Map(),
    healthByRun: new Map(),
    lastReported: new Map(),
    inflight: new Set(),
    pending: [],
    timer: null,
    seq: 0,
  };
}

/**
 * Span tracer over `trace_spans` (contracts/trace-spans.md). Never throws into the caller for its
 * own failures: a failed write is logged and counted per run (`health`).
 */
export function createTracer(deps: TracerDeps): Tracer {
  const core = coreOf(deps);
  return {
    bootId: core.bootId,
    level: deps.level,
    start: (boot) => startBoot(core, boot, deps),
    sweepUnfinished: () => sweepUnfinished(core),
    call: (c, fn) => traceCall(core, c, fn),
    phase: (name, fn, attrs) => tracePhase(core, name, fn, attrs),
    event: (name, attrs, opts) => traceEvent(core, name, attrs, opts),
    eventForRun: (runId, name, attrs, opts) => eventForRun(core, runId, { name, attrs, opts }),
    currentCall: () => currentCall(core),
    countFailure(runId) {
      healthOf(core, runId).dropped += 1;
    },
    inCall() {
      const ctx = core.als.getStore();
      return ctx !== undefined && !ctx.call.closed;
    },
    health: (runId) => ({ ...healthOf(core, runId) }),
    flush: () => flush(core),
    shutdown: () => shutdown(core),
  };
}
