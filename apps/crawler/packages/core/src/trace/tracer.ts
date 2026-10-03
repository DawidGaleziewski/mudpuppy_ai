import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import type { Logger } from 'pino';
import type { PathfinderDb } from '../db.js';
import type { TraceSpansTable } from '../db-types.js';
import type { EvidenceStore } from '../evidence.js';
import { newId as defaultNewId } from '../ids.js';
import { maskText } from '../pii.js';
import type { PwTraceMode, TraceLevel, TraceServer } from '../schemas/trace-boot.js';
import type { SpanKind, SpanStatus } from '../schemas/trace-span.js';
import { fitPayload, fitText } from './limits.js';

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
  'record_state',
  'record_forms',
  'record_transition',
  'record_api_calls',
  'enqueue_frontier',
  'record_step',
  'run_bookkeeping',
  'complete_run',
  'pw_trace',
] as const;
export type PhaseName = (typeof PHASE_NAMES)[number];

export const EVENT_NAMES = [
  'gate_decision',
  'item_cap',
  'locator',
  'stabilization_timeout',
  'fingerprint_assign',
  'state_recorded',
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
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** Calls that drive the run's page; Playwright callbacks attach to the open one (research §3). */
export const BROWSER_TOOLS: ReadonlySet<string> = new Set(['start_run', 'navigate', 'act']);

export type Attrs = Record<string, unknown>;

export interface TracerDeps {
  db: PathfinderDb;
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
  start(boot: {
    environment: string;
    server: TraceServer;
    version: string;
    pwTrace: PwTraceMode;
  }): Promise<void>;
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

interface SpanRec {
  id: string;
  seq: number;
  kind: SpanKind;
  name: string;
  parentId: string | null;
  status: SpanStatus;
  explicitStatus: SpanStatus | null;
  startedAt: string;
  startMono: number;
  endedAt: string | null;
  durationMs: number | null;
  attrs: Attrs;
  summary: string | null;
  decisionId: string | null;
}

interface CallRec extends SpanRec {
  runId: string | null;
  children: SpanRec[];
  toolUseId: string | null;
  agentId: string | null;
  rationale: string | null;
  pwTracePath: string | null;
  output: { value: unknown } | null;
  inserted: boolean;
  closed: boolean;
  registered: boolean;
}

interface Ctx {
  call: CallRec;
  span: SpanRec;
}

interface Pending {
  rec: SpanRec;
  runId: string;
}

const INSERT_CHUNK = 400;
const NOOP_HANDLE: SpanHandle = {
  id: '',
  setRunId() {},
  set() {},
  setStatus() {},
  setOutput() {},
  setSummary() {},
};
const errorsSeen = new WeakSet<object>();

function statusFor(e: unknown): SpanStatus {
  const code = (e as { code?: unknown } | null)?.code;
  if (code === 'ACTION_REFUSED') return 'refused';
  if (code === 'RUN_STOPPED') return 'stopped';
  return 'error';
}

function isToolError(e: unknown): boolean {
  return (
    e instanceof Error &&
    e.name === 'ToolError' &&
    typeof (e as { code?: unknown }).code === 'string'
  );
}

function errorAttrs(e: unknown): Attrs {
  if (isToolError(e)) {
    const te = e as Error & { code: string };
    return { code: te.code, message: maskText(te.message) };
  }
  if (e instanceof Error) {
    const top = e.stack?.split('\n').find((l) => l.trim().startsWith('at '));
    return {
      code: e.name,
      message: maskText(e.message),
      ...(top ? { stack_top: maskText(top.trim()) } : {}),
    };
  }
  return { code: 'non_error_throw', message: maskText(String(e)) };
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Span tracer over `trace_spans` (contracts/trace-spans.md). Never throws into the caller for its
 * own failures: a failed write is logged and counted per run (`health`).
 */
export function createTracer(deps: TracerDeps): Tracer {
  const { db, logger, evidence, level } = deps;
  const now = deps.now ?? (() => new Date());
  const monotonic = deps.monotonic ?? (() => performance.now());
  const newId = deps.newId ?? (() => defaultNewId());
  const flushIntervalMs = deps.flushIntervalMs ?? 1000;
  const recording = level !== 'off';

  const bootId = newId();
  const als = new AsyncLocalStorage<Ctx>();
  const openByRun = new Map<string, CallRec[]>();
  const healthByRun = new Map<string, TraceHealth>();
  const lastReported = new Map<string, string>();
  const inflight = new Set<Promise<unknown>>();
  let pending: Pending[] = [];
  let timer: NodeJS.Timeout | null = null;
  let seq = 0;

  const iso = (): string => now().toISOString();
  const healthOf = (runId: string | null): TraceHealth => {
    const key = runId ?? '';
    let h = healthByRun.get(key);
    if (!h) healthByRun.set(key, (h = { dropped: 0, truncated: 0 }));
    return h;
  };

  const track = <T>(p: Promise<T>): Promise<T> => {
    inflight.add(p);
    void p.finally(() => inflight.delete(p)).catch(() => {});
    return p;
  };

  async function safeWrite(
    runId: string | null,
    rows: number,
    what: string,
    fn: () => Promise<unknown>,
  ): Promise<boolean> {
    try {
      await fn();
      return true;
    } catch (err) {
      healthOf(runId).dropped += rows;
      logger.warn(
        { err: (err as Error)?.message, run_id: runId, rows, what },
        'trace write failed',
      );
      return false;
    }
  }

  function newSpan(
    kind: SpanKind,
    name: string,
    parentId: string | null,
    attrs: Attrs = {},
  ): SpanRec {
    return {
      id: newId(),
      seq: ++seq,
      kind,
      name,
      parentId,
      status: kind === 'event' ? 'ok' : 'running',
      explicitStatus: null,
      startedAt: iso(),
      startMono: monotonic(),
      endedAt: null,
      durationMs: null,
      attrs: { ...attrs },
      summary: null,
      decisionId: null,
    };
  }

  function end(span: SpanRec, status: SpanStatus): void {
    span.status = status;
    span.endedAt = iso();
    span.durationMs = Math.max(0, Math.round(monotonic() - span.startMono));
  }

  function makeEvent(
    name: EventName,
    parentId: string | null,
    attrs: Attrs,
    opts: EventOpts = {},
  ): SpanRec {
    const ev = newSpan('event', name, parentId, attrs);
    ev.status = opts.status ?? 'ok';
    ev.summary = opts.summary ?? null;
    ev.decisionId = opts.decisionId ?? null;
    return ev;
  }

  function emitErrorOnce(call: CallRec, span: SpanRec, e: unknown): void {
    if (!recording || call.closed) return;
    if (e !== null && typeof e === 'object') {
      if (errorsSeen.has(e)) return;
      errorsSeen.add(e);
    }
    call.children.push(makeEvent('error', span.id, errorAttrs(e), { status: statusFor(e) }));
  }

  function register(call: CallRec): void {
    if (call.registered || !call.runId || !BROWSER_TOOLS.has(call.name)) return;
    call.registered = true;
    const open = openByRun.get(call.runId) ?? [];
    if (recording && open.length > 0) {
      call.children.push(
        makeEvent('concurrent_calls', call.id, {
          overlapping_calls: open.map((c) => c.id),
          run_id: call.runId,
        }),
      );
      for (const other of open)
        other.children.push(
          makeEvent('concurrent_calls', other.id, {
            overlapping_calls: [call.id],
            run_id: call.runId,
          }),
        );
    }
    openByRun.set(call.runId, [...open, call]);
  }

  function unregister(call: CallRec): void {
    if (!call.registered || !call.runId) return;
    const rest = (openByRun.get(call.runId) ?? []).filter((c) => c !== call);
    if (rest.length) openByRun.set(call.runId, rest);
    else openByRun.delete(call.runId);
  }

  function handleFor(span: SpanRec, call: CallRec | null): SpanHandle {
    return {
      id: span.id,
      setRunId(id) {
        if (!call || span !== call) return;
        call.runId = id;
        register(call);
      },
      set(attrs) {
        Object.assign(span.attrs, attrs);
      },
      setStatus(s) {
        span.explicitStatus = s;
      },
      setOutput(v) {
        if (call && span === call) call.output = { value: v };
        else span.attrs.output = v;
      },
      setSummary(s) {
        span.summary = s;
      },
    };
  }

  async function rowOf(
    span: SpanRec,
    runId: string | null,
    attrs: Attrs,
    extra: Partial<TraceSpansTable> = {},
  ): Promise<{ row: TraceSpansTable; truncated: boolean }> {
    const fitted = await fitPayload(attrs, { store: evidence });
    const inline =
      fitted.inline !== null && typeof fitted.inline === 'object' && !Array.isArray(fitted.inline)
        ? fitted.inline
        : { value: fitted.inline };
    const summary = fitText(span.summary ?? defaultSummary(span), 300);
    return {
      row: {
        id: span.id,
        boot_id: bootId,
        seq: span.seq,
        run_id: runId,
        parent_id: span.parentId,
        kind: span.kind,
        name: span.name,
        status: span.status,
        started_at: span.startedAt,
        ended_at: span.endedAt,
        duration_ms: span.durationMs,
        attrs_json: JSON.stringify(inline),
        payload_ref: fitted.payload_ref ?? null,
        summary: summary.text || span.name,
        decision_id: span.decisionId,
        tool_use_id: null,
        agent_id: null,
        rationale: null,
        pw_trace_path: null,
        between_calls: 0,
        ...extra,
      },
      truncated: fitted.truncated || summary.truncated,
    };
  }

  function defaultSummary(span: SpanRec): string {
    return span.kind === 'event' ? span.name : `${span.name} ${span.status}`;
  }

  function callAttrs(call: CallRec): Attrs {
    return call.output ? { ...call.attrs, output: call.output.value } : call.attrs;
  }

  function callExtra(call: CallRec): Partial<TraceSpansTable> {
    return {
      tool_use_id: call.toolUseId,
      agent_id: call.agentId,
      rationale: call.rationale,
      pw_trace_path: call.pwTracePath,
    };
  }

  async function insertRows(rows: TraceSpansTable[], trx: PathfinderDb): Promise<void> {
    for (let i = 0; i < rows.length; i += INSERT_CHUNK)
      await trx
        .insertInto('trace_spans')
        .values(rows.slice(i, i + INSERT_CHUNK))
        .execute();
  }

  async function flushCall(call: CallRec): Promise<void> {
    let truncated = 0;
    const main = await rowOf(call, call.runId, callAttrs(call), callExtra(call));
    if (main.truncated) truncated += 1;
    const children: TraceSpansTable[] = [];
    for (const child of call.children) {
      const r = await rowOf(child, call.runId, child.attrs);
      if (r.truncated) truncated += 1;
      children.push(r.row);
    }
    const health = healthOf(call.runId);
    health.truncated += truncated;
    if (recording && call.runId) {
      const key = `${health.dropped}/${health.truncated}`;
      const before = lastReported.get(call.runId) ?? '0/0';
      if (key !== before) {
        lastReported.set(call.runId, key);
        const ev = makeEvent('trace_health', call.id, {
          dropped: health.dropped,
          truncated: health.truncated,
        });
        children.push((await rowOf(ev, call.runId, ev.attrs)).row);
      }
    }
    await safeWrite(call.runId, children.length + 1, 'call end', () =>
      db.transaction().execute(async (trx) => {
        if (call.inserted) {
          const res = await trx
            .updateTable('trace_spans')
            .set(main.row)
            .where('id', '=', call.id)
            .executeTakeFirst();
          if (Number(res.numUpdatedRows) === 0)
            await trx.insertInto('trace_spans').values(main.row).execute();
        } else {
          await trx.insertInto('trace_spans').values(main.row).execute();
        }
        await insertRows(children, trx);
      }),
    );
  }

  function scheduleFlush(): void {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void track(flush());
    }, flushIntervalMs);
    timer.unref();
  }

  function queueBetween(runId: string, name: EventName, attrs: Attrs, opts?: EventOpts): void {
    pending.push({ rec: makeEvent(name, null, attrs, opts), runId });
    scheduleFlush();
  }

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const batch = pending;
    pending = [];
    const byRun = new Map<string, TraceSpansTable[]>();
    for (const p of batch) {
      const r = await rowOf(p.rec, p.runId, p.rec.attrs, { between_calls: 1 });
      if (r.truncated) healthOf(p.runId).truncated += 1;
      byRun.set(p.runId, [...(byRun.get(p.runId) ?? []), r.row]);
    }
    for (const [runId, rows] of byRun)
      await safeWrite(runId, rows.length, 'between calls', () =>
        db.transaction().execute((trx) => insertRows(rows, trx)),
      );
  }

  function attachToCall(
    call: CallRec,
    parent: SpanRec,
    name: EventName,
    attrs: Attrs,
    opts?: EventOpts,
  ): void {
    call.children.push(makeEvent(name, parent.id, attrs, opts));
  }

  const tracer: Tracer = {
    bootId,
    level,

    async start(boot) {
      await safeWrite(null, 1, 'boot', () =>
        db
          .insertInto('trace_boots')
          .values({
            id: bootId,
            started_at: iso(),
            ended_at: null,
            environment: boot.environment,
            server: boot.server,
            pid: process.pid,
            version: boot.version,
            trace_level: level,
            pw_trace: boot.pwTrace,
          })
          .execute(),
      );
    },

    async sweepUnfinished() {
      let n = 0;
      await safeWrite(null, 0, 'sweep', async () => {
        const res = await db
          .updateTable('trace_spans')
          .set({ status: 'unfinished' })
          .where('status', '=', 'running')
          .where('boot_id', '<>', bootId)
          .executeTakeFirst();
        n = Number(res.numUpdatedRows);
      });
      return n;
    },

    async call(c, fn) {
      let runId = c.runId;
      const attrs: Attrs = { args: c.args };
      if (c.requestId !== undefined) attrs.request_id = c.requestId;
      const agentType = str(c.meta?.['claudecode/agentType']);
      if (agentType) attrs.agent_type = agentType;
      if (runId) {
        try {
          const exists = await db
            .selectFrom('runs')
            .select('id')
            .where('id', '=', runId)
            .executeTakeFirst();
          if (!exists) {
            attrs.unknown_run_id = runId;
            runId = null;
          }
        } catch {
          /* store unreadable: the insert below will fail and be counted */
        }
      }
      const call: CallRec = {
        ...newSpan('call', c.tool, null, attrs),
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
      const start = await rowOf(call, runId, call.attrs, callExtra(call));
      call.inserted = await safeWrite(runId, 1, 'call start', () =>
        db.insertInto('trace_spans').values(start.row).execute(),
      );
      register(call);
      const handle = handleFor(call, call);
      try {
        const result = await als.run({ call, span: call }, () => fn(handle));
        end(call, call.explicitStatus ?? 'ok');
        return result;
      } catch (e) {
        end(call, statusFor(e));
        emitErrorOnce(call, call, e);
        throw e;
      } finally {
        call.closed = true;
        unregister(call);
        await track(flushCall(call));
      }
    },

    async phase(name, fn, attrs) {
      const ctx = als.getStore();
      // Services also run outside a tool call (direct tests, scripts): run untraced.
      if (!ctx || ctx.call.closed) return fn(NOOP_HANDLE);
      if (!recording) return fn(NOOP_HANDLE);
      const span = newSpan('phase', name, ctx.span.id, attrs);
      ctx.call.children.push(span);
      try {
        const result = await als.run({ call: ctx.call, span }, () => fn(handleFor(span, ctx.call)));
        end(span, span.explicitStatus ?? 'ok');
        return result;
      } catch (e) {
        end(span, statusFor(e));
        emitErrorOnce(ctx.call, span, e);
        throw e;
      }
    },

    event(name, attrs, opts) {
      if (!recording) return;
      const ctx = als.getStore();
      if (!ctx) {
        healthOf(null).dropped += 1;
        return;
      }
      if (ctx.call.closed) {
        // A callback still carrying a finished call's context (e.g. Playwright's connection was
        // opened inside start_run): route it like a browser callback.
        if (ctx.call.runId) tracer.eventForRun(ctx.call.runId, name, attrs, opts);
        else healthOf(null).dropped += 1;
        return;
      }
      attachToCall(ctx.call, ctx.span, name, attrs, opts);
    },

    eventForRun(runId, name, attrs, opts) {
      if (!recording) return;
      const open = openByRun.get(runId);
      const target = open?.[open.length - 1];
      if (!open || !target) {
        queueBetween(runId, name, attrs, opts);
        return;
      }
      const withOverlap =
        open.length > 1
          ? { ...attrs, overlapping_calls: open.filter((c) => c !== target).map((c) => c.id) }
          : attrs;
      attachToCall(target, target, name, withOverlap, opts);
    },

    currentCall() {
      const ctx = als.getStore();
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
    },

    countFailure(runId) {
      healthOf(runId).dropped += 1;
    },

    inCall() {
      const ctx = als.getStore();
      return ctx !== undefined && !ctx.call.closed;
    },

    health(runId) {
      return { ...healthOf(runId) };
    },

    flush,

    async shutdown() {
      await Promise.allSettled([...inflight]);
      await flush();
      await safeWrite(null, 0, 'boot end', () =>
        db.updateTable('trace_boots').set({ ended_at: iso() }).where('id', '=', bootId).execute(),
      );
    },
  };
  return tracer;
}
