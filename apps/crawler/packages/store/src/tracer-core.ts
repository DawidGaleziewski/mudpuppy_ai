/**
 * The tracer's state and its span bookkeeping (spec 042 T014: `createTracer`'s closure as one
 * record and functions over it): span records, the open browser calls per run, rows for
 * `trace_spans`, the between-calls queue, health per run. Internal to `tracer.ts`.
 */
import type { AsyncLocalStorage } from 'node:async_hooks';
import type { Logger } from 'pino';
import { maskText, type EvidenceStore } from '@mudpuppy/core';
import { fitPayload, fitText, type SpanKind, type SpanStatus } from '@mudpuppy/trace';
import type { MudPuppyDb } from './db.js';
import type { TraceSpansTable } from './db-types.js';
import {
  BROWSER_TOOLS,
  type Attrs,
  type EventName,
  type EventOpts,
  type SpanHandle,
  type TraceHealth,
} from './tracer-types.js';

export interface SpanRec {
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

export interface CallRec extends SpanRec {
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

export interface Ctx {
  call: CallRec;
  span: SpanRec;
}

interface Pending {
  rec: SpanRec;
  runId: string;
}

/** Everything one tracer shares between its calls (was `createTracer`'s closure). */
export interface TraceCore {
  db: MudPuppyDb;
  logger: Logger;
  evidence: Pick<EvidenceStore, 'storeJson'>;
  recording: boolean;
  now: () => Date;
  monotonic: () => number;
  newId: () => string;
  flushIntervalMs: number;
  bootId: string;
  als: AsyncLocalStorage<Ctx>;
  openByRun: Map<string, CallRec[]>;
  healthByRun: Map<string, TraceHealth>;
  lastReported: Map<string, string>;
  inflight: Set<Promise<unknown>>;
  pending: Pending[];
  timer: NodeJS.Timeout | null;
  seq: number;
}

const INSERT_CHUNK = 400;
export const NOOP_HANDLE: SpanHandle = {
  id: '',
  setRunId() {},
  set() {},
  setStatus() {},
  setOutput() {},
  setSummary() {},
};
const errorsSeen = new WeakSet<object>();

export function statusFor(e: unknown): SpanStatus {
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

export const iso = (core: TraceCore): string => core.now().toISOString();

export function healthOf(core: TraceCore, runId: string | null): TraceHealth {
  const key = runId ?? '';
  let h = core.healthByRun.get(key);
  if (!h) core.healthByRun.set(key, (h = { dropped: 0, truncated: 0 }));
  return h;
}

export function track<T>(core: TraceCore, p: Promise<T>): Promise<T> {
  core.inflight.add(p);
  void p.finally(() => core.inflight.delete(p)).catch(() => {});
  return p;
}

export async function safeWrite(
  core: TraceCore,
  write: { runId: string | null; rows: number; what: string },
  fn: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    healthOf(core, write.runId).dropped += write.rows;
    core.logger.warn(
      { err: (err as Error)?.message, run_id: write.runId, rows: write.rows, what: write.what },
      'trace write failed',
    );
    return false;
  }
}

export function newSpan(
  core: TraceCore,
  kind: SpanKind,
  name: string,
  parentId: string | null,
  attrs: Attrs = {},
): SpanRec {
  return {
    id: core.newId(),
    seq: ++core.seq,
    kind,
    name,
    parentId,
    status: kind === 'event' ? 'ok' : 'running',
    explicitStatus: null,
    startedAt: iso(core),
    startMono: core.monotonic(),
    endedAt: null,
    durationMs: null,
    attrs: { ...attrs },
    summary: null,
    decisionId: null,
  };
}

export function end(core: TraceCore, span: SpanRec, status: SpanStatus): void {
  span.status = status;
  span.endedAt = iso(core);
  span.durationMs = Math.max(0, Math.round(core.monotonic() - span.startMono));
}

export function makeEvent(
  core: TraceCore,
  name: EventName,
  parentId: string | null,
  attrs: Attrs,
  opts: EventOpts = {},
): SpanRec {
  const ev = newSpan(core, 'event', name, parentId, attrs);
  ev.status = opts.status ?? 'ok';
  ev.summary = opts.summary ?? null;
  ev.decisionId = opts.decisionId ?? null;
  return ev;
}

export function emitErrorOnce(core: TraceCore, call: CallRec, span: SpanRec, e: unknown): void {
  if (!core.recording || call.closed) return;
  if (e !== null && typeof e === 'object') {
    if (errorsSeen.has(e)) return;
    errorsSeen.add(e);
  }
  call.children.push(makeEvent(core, 'error', span.id, errorAttrs(e), { status: statusFor(e) }));
}

export function register(core: TraceCore, call: CallRec): void {
  if (call.registered || !call.runId || !BROWSER_TOOLS.has(call.name)) return;
  call.registered = true;
  const open = core.openByRun.get(call.runId) ?? [];
  if (core.recording && open.length > 0) {
    call.children.push(
      makeEvent(core, 'concurrent_calls', call.id, {
        overlapping_calls: open.map((c) => c.id),
        run_id: call.runId,
      }),
    );
    for (const other of open)
      other.children.push(
        makeEvent(core, 'concurrent_calls', other.id, {
          overlapping_calls: [call.id],
          run_id: call.runId,
        }),
      );
  }
  core.openByRun.set(call.runId, [...open, call]);
}

export function unregister(core: TraceCore, call: CallRec): void {
  if (!call.registered || !call.runId) return;
  const rest = (core.openByRun.get(call.runId) ?? []).filter((c) => c !== call);
  if (rest.length) core.openByRun.set(call.runId, rest);
  else core.openByRun.delete(call.runId);
}

export function handleFor(core: TraceCore, span: SpanRec, call: CallRec | null): SpanHandle {
  return {
    id: span.id,
    setRunId(id) {
      if (!call || span !== call) return;
      call.runId = id;
      register(core, call);
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

function defaultSummary(span: SpanRec): string {
  return span.kind === 'event' ? span.name : `${span.name} ${span.status}`;
}

export async function rowOf(
  core: TraceCore,
  span: SpanRec,
  runId: string | null,
  attrs: Attrs,
  extra: Partial<TraceSpansTable> = {},
): Promise<{ row: TraceSpansTable; truncated: boolean }> {
  const fitted = await fitPayload(attrs, { store: core.evidence });
  const inline =
    fitted.inline !== null && typeof fitted.inline === 'object' && !Array.isArray(fitted.inline)
      ? fitted.inline
      : { value: fitted.inline };
  const summary = fitText(span.summary ?? defaultSummary(span), 300);
  return {
    row: {
      id: span.id,
      boot_id: core.bootId,
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

function callAttrs(call: CallRec): Attrs {
  return call.output ? { ...call.attrs, output: call.output.value } : call.attrs;
}

export function callExtra(call: CallRec): Partial<TraceSpansTable> {
  return {
    tool_use_id: call.toolUseId,
    agent_id: call.agentId,
    rationale: call.rationale,
    pw_trace_path: call.pwTracePath,
  };
}

async function insertRows(rows: TraceSpansTable[], trx: MudPuppyDb): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK)
    await trx
      .insertInto('trace_spans')
      .values(rows.slice(i, i + INSERT_CHUNK))
      .execute();
}

/** The call's children as rows, with a `trace_health` event when the run's health changed. */
async function childRows(core: TraceCore, call: CallRec, mainTruncated: boolean) {
  let truncated = mainTruncated ? 1 : 0;
  const children: TraceSpansTable[] = [];
  for (const child of call.children) {
    const r = await rowOf(core, child, call.runId, child.attrs);
    if (r.truncated) truncated += 1;
    children.push(r.row);
  }
  const health = healthOf(core, call.runId);
  health.truncated += truncated;
  if (core.recording && call.runId) {
    const key = `${health.dropped}/${health.truncated}`;
    const before = core.lastReported.get(call.runId) ?? '0/0';
    if (key !== before) {
      core.lastReported.set(call.runId, key);
      const ev = makeEvent(core, 'trace_health', call.id, {
        dropped: health.dropped,
        truncated: health.truncated,
      });
      children.push((await rowOf(core, ev, call.runId, ev.attrs)).row);
    }
  }
  return children;
}

export async function flushCall(core: TraceCore, call: CallRec): Promise<void> {
  const main = await rowOf(core, call, call.runId, callAttrs(call), callExtra(call));
  const children = await childRows(core, call, main.truncated);
  await safeWrite(core, { runId: call.runId, rows: children.length + 1, what: 'call end' }, () =>
    core.db.transaction().execute(async (trx) => {
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

function scheduleFlush(core: TraceCore): void {
  if (core.timer) return;
  core.timer = setTimeout(() => {
    core.timer = null;
    void track(core, flush(core));
  }, core.flushIntervalMs);
  core.timer.unref();
}

export function queueBetween(
  core: TraceCore,
  runId: string,
  event: { name: EventName; attrs: Attrs; opts?: EventOpts },
): void {
  core.pending.push({ rec: makeEvent(core, event.name, null, event.attrs, event.opts), runId });
  scheduleFlush(core);
}

export async function flush(core: TraceCore): Promise<void> {
  if (core.timer) {
    clearTimeout(core.timer);
    core.timer = null;
  }
  const batch = core.pending;
  core.pending = [];
  const byRun = new Map<string, TraceSpansTable[]>();
  for (const p of batch) {
    const r = await rowOf(core, p.rec, p.runId, p.rec.attrs, { between_calls: 1 });
    if (r.truncated) healthOf(core, p.runId).truncated += 1;
    byRun.set(p.runId, [...(byRun.get(p.runId) ?? []), r.row]);
  }
  for (const [runId, rows] of byRun)
    await safeWrite(core, { runId, rows: rows.length, what: 'between calls' }, () =>
      core.db.transaction().execute((trx) => insertRows(rows, trx)),
    );
}
