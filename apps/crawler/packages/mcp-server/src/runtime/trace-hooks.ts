import { maskText, shapeUrl, type Attrs, type EventName, type Tracer } from '@pathfinder/core';
import type { RequestDecision, SessionOptions } from '@pathfinder/crawler';

/** A limiter wait longer than this is always worth its own event (research §10). */
const SLOW_WAIT_MS = 1000;
/** Requests still waiting for a response are forgotten beyond this many (never-answered requests). */
const MAX_PENDING = 1000;

interface Pending {
  d: RequestDecision;
}

export interface RunTraceHooks {
  /** Handed to `BrowserSession.launch`; never changes what the gate decides. */
  observe: NonNullable<SessionOptions['observe']>;
  /** Start counting requests for the browser call now running. */
  beginCall(): void;
  /** Emit the call's `request_aggregate`; must run inside the call. */
  endCall(): void;
}

/** Emit inside the current call when there is one, else under the run's open browser call. */
export function emitForRun(tracer: Tracer, runId: string, name: EventName, attrs: Attrs): void {
  if (tracer.inCall()) tracer.event(name, attrs);
  else tracer.eventForRun(runId, name, attrs);
}

/**
 * Request-gate and network callbacks of one run turned into trace events (contracts/trace-spans.md):
 * `request` for notable requests (all at `verbose`), `request_aggregate` per browser call,
 * `limiter_wait`, `robots_check` on every occurrence and `block_verdict`. Playwright calls these
 * outside the tool call's async chain, so they go through `eventForRun`. Requests between calls
 * are recorded individually when notable but not aggregated.
 */
export function createRunTraceHooks(
  tracer: Tracer,
  runId: string,
  templateFor: (url: string) => string,
): RunTraceHooks {
  const pending = new Map<string, Pending[]>();
  let pendingCount = 0;
  let agg = { byTypeDecision: {} as Record<string, number>, limiterWaitMsTotal: 0, count: 0 };
  const verbose = tracer.level === 'verbose';
  const shape = (url: string) => shapeUrl(url, templateFor);
  const emit = (name: EventName, attrs: Attrs) => tracer.eventForRun(runId, name, attrs);

  const requestAttrs = (
    d: RequestDecision,
    extra: { status?: number; failed?: string } = {},
  ): Attrs => ({
    method: d.method,
    resource_type: d.resourceType,
    url: shape(d.url),
    main_frame: d.mainFrame,
    decision: d.decision,
    ...(d.reason ? { reason: d.reason } : {}),
    ...(d.rule ? { rule: d.rule } : {}),
    ...(d.robotsRule ? { robots_rule: d.robotsRule } : {}),
    limiter_wait_ms: Math.round(d.limiterWaitMs),
    ...(d.status !== undefined ? { status: d.status } : {}),
    ...(extra.status !== undefined ? { status: extra.status } : {}),
    ...(d.redirectTo ? { redirect_to: shape(d.redirectTo) } : {}),
    ...(d.failed ? { failed: maskText(d.failed) } : {}),
    ...(extra.failed ? { failed: maskText(extra.failed) } : {}),
  });

  const take = (url: string): Pending | undefined => {
    const list = pending.get(url);
    const first = list?.shift();
    if (list && list.length === 0) pending.delete(url);
    if (first) pendingCount -= 1;
    return first;
  };

  const remember = (d: RequestDecision): void => {
    if (pendingCount >= MAX_PENDING) {
      const oldest = pending.keys().next().value;
      if (oldest !== undefined) take(oldest);
    }
    pending.set(d.url, [...(pending.get(d.url) ?? []), { d }]);
    pendingCount += 1;
  };

  const notable = (d: RequestDecision, status?: number): boolean =>
    verbose ||
    d.mainFrame ||
    d.decision !== 'continue' ||
    d.limiterWaitMs > SLOW_WAIT_MS ||
    d.redirectTo !== undefined ||
    d.failed !== undefined ||
    (status !== undefined && status >= 300);

  return {
    observe: {
      onRequestDecision(d) {
        const key = `${d.resourceType}:${d.decision}`;
        agg.byTypeDecision[key] = (agg.byTypeDecision[key] ?? 0) + 1;
        agg.limiterWaitMsTotal += d.limiterWaitMs;
        agg.count += 1;
        if (d.limiterWaitMs > SLOW_WAIT_MS || d.reason === 'limiter_halted')
          emit('limiter_wait', {
            wait_ms: Math.round(d.limiterWaitMs),
            halted: d.reason === 'limiter_halted',
          });
        // A continued request's status arrives with its response; everything else is final now.
        if (d.decision === 'continue' && d.status === undefined && d.failed === undefined)
          remember(d);
        else if (notable(d, d.status)) emit('request', requestAttrs(d));
      },
      onResponse(r) {
        const p = take(r.url);
        if (p && notable(p.d, r.status)) emit('request', requestAttrs(p.d, { status: r.status }));
      },
      onRequestFailed(f) {
        const p = take(f.url);
        if (p) emit('request', requestAttrs(p.d, { failed: f.failure }));
        else
          emit('request', {
            resource_type: f.resourceType,
            url: shape(f.url),
            failed: maskText(f.failure),
          });
      },
      onRobotsCheck(c) {
        emit('robots_check', { url: shape(c.url), rule: c.rule, action: c.action });
      },
      onBlockVerdict(v) {
        emit('block_verdict', { signature: v.kind, status: v.status, url: shape(v.url) });
      },
    },
    beginCall() {
      agg = { byTypeDecision: {}, limiterWaitMsTotal: 0, count: 0 };
    },
    endCall() {
      if (agg.count > 0)
        tracer.event('request_aggregate', {
          by_type_decision: agg.byTypeDecision,
          // integer ms: raw performance.now() fractions read like card numbers to the PII audit
          limiter_wait_ms_total: Math.round(agg.limiterWaitMsTotal),
          count: agg.count,
        });
      agg = { byTypeDecision: {}, limiterWaitMsTotal: 0, count: 0 };
    },
  };
}
