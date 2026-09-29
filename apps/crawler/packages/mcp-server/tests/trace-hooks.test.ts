import { describe, expect, it } from 'vitest';
import type { Attrs, EventName, Tracer } from '@pathfinder/core';
import type { RequestDecision } from '@pathfinder/crawler';
import { createRunTraceHooks } from '../src/runtime/trace-hooks.js';

function stubTracer(level: Tracer['level'] = 'standard') {
  const events: { via: 'run' | 'call'; name: EventName; attrs: Attrs }[] = [];
  const tracer = {
    level,
    inCall: () => false,
    event: (name: EventName, attrs: Attrs) => void events.push({ via: 'call', name, attrs }),
    eventForRun: (_run: string, name: EventName, attrs: Attrs) =>
      void events.push({ via: 'run', name, attrs }),
  } as unknown as Tracer;
  return { tracer, events };
}

const req = (over: Partial<RequestDecision> = {}): RequestDecision => ({
  url: 'https://shop.pl/api/x?token=abc',
  method: 'GET',
  resourceType: 'xhr',
  mainFrame: false,
  decision: 'continue',
  limiterWaitMs: 0,
  ...over,
});

describe('run trace hooks', () => {
  it('records a main-frame request with its status and shapes the URL', () => {
    const { tracer, events } = stubTracer();
    const h = createRunTraceHooks(tracer, 'r', () => '/p/:id');
    h.observe.onRequestDecision!(
      req({ url: 'https://shop.pl/p/1?q=1', mainFrame: true, resourceType: 'document' }),
    );
    expect(events).toEqual([]);
    h.observe.onResponse!({
      url: 'https://shop.pl/p/1?q=1',
      status: 200,
      resourceType: 'document',
    });
    expect(events).toEqual([
      {
        via: 'run',
        name: 'request',
        attrs: expect.objectContaining({
          main_frame: true,
          status: 200,
          url: { origin: 'https://shop.pl', route: '/p/:id', query_keys: ['q'] },
        }),
      },
    ]);
  });

  it('skips an ordinary 200 subresource at standard, records it at verbose', () => {
    for (const [level, n] of [
      ['standard', 0],
      ['verbose', 1],
    ] as const) {
      const { tracer, events } = stubTracer(level);
      const h = createRunTraceHooks(tracer, 'r', (u) => new URL(u).pathname);
      h.observe.onRequestDecision!(req());
      h.observe.onResponse!({ url: req().url, status: 200, resourceType: 'xhr' });
      expect(events.filter((e) => e.name === 'request')).toHaveLength(n);
    }
  });

  it('always records aborted, failed, redirected, >= 400 and slow requests', () => {
    const { tracer, events } = stubTracer();
    const h = createRunTraceHooks(tracer, 'r', (u) => new URL(u).pathname);
    h.observe.onRequestDecision!(
      req({ decision: 'abort', reason: 'robots', url: 'https://shop.pl/admin/a' }),
    );
    h.observe.onRequestDecision!(req({ url: 'https://shop.pl/b' }));
    h.observe.onResponse!({ url: 'https://shop.pl/b', status: 404, resourceType: 'xhr' });
    h.observe.onRequestDecision!(req({ url: 'https://shop.pl/c' }));
    h.observe.onRequestFailed!({
      url: 'https://shop.pl/c',
      resourceType: 'xhr',
      failure: 'net::ERR_ABORTED',
    });
    h.observe.onRequestDecision!(req({ url: 'https://shop.pl/d', limiterWaitMs: 1500 }));
    h.observe.onResponse!({ url: 'https://shop.pl/d', status: 200, resourceType: 'xhr' });
    const requests = events.filter((e) => e.name === 'request').map((e) => e.attrs);
    expect(requests.map((a) => (a.url as { route: string }).route)).toEqual([
      '/admin/a',
      '/b',
      '/c',
      '/d',
    ]);
    expect(requests[0]).toMatchObject({ decision: 'abort', reason: 'robots' });
    expect(requests[1]).toMatchObject({ status: 404 });
    expect(requests[2]).toMatchObject({ failed: 'net::ERR_ABORTED' });
    expect(events.find((e) => e.name === 'limiter_wait')?.attrs).toEqual({
      wait_ms: 1500,
      halted: false,
    });
  });

  it('aggregates every request of a call and emits it inside the call', () => {
    const { tracer, events } = stubTracer();
    const h = createRunTraceHooks(tracer, 'r', (u) => new URL(u).pathname);
    h.observe.onRequestDecision!(req({ url: 'https://shop.pl/between' }));
    h.beginCall();
    h.observe.onRequestDecision!(req({ limiterWaitMs: 5.006437000000005 }));
    h.observe.onRequestDecision!(req({ limiterWaitMs: 7.0000123 }));
    h.observe.onRequestDecision!(
      req({ resourceType: 'image', decision: 'abort', reason: 'robots' }),
    );
    h.endCall();
    h.endCall();
    const agg = events.filter((e) => e.name === 'request_aggregate');
    expect(agg).toEqual([
      {
        via: 'call',
        name: 'request_aggregate',
        attrs: {
          by_type_decision: { 'xhr:continue': 2, 'image:abort': 1 },
          limiter_wait_ms_total: 12,
          count: 3,
        },
      },
    ]);
  });

  it('reports robots checks on every occurrence and block verdicts', () => {
    const { tracer, events } = stubTracer();
    const h = createRunTraceHooks(tracer, 'r', (u) => new URL(u).pathname);
    h.observe.onRobotsCheck!({
      url: 'https://shop.pl/admin/x?id=1',
      rule: 'Disallow: /admin/',
      action: 'blocked',
    });
    h.observe.onRobotsCheck!({
      url: 'https://shop.pl/admin/x?id=2',
      rule: 'Disallow: /admin/',
      action: 'blocked',
    });
    h.observe.onBlockVerdict!({
      kind: 'cloudflare',
      warning: 'blocked',
      status: 403,
      url: 'https://shop.pl/',
    });
    expect(events.map((e) => e.name)).toEqual(['robots_check', 'robots_check', 'block_verdict']);
    expect(events[2]!.attrs).toEqual({
      signature: 'cloudflare',
      status: 403,
      url: { origin: 'https://shop.pl', route: '/', query_keys: [] },
    });
  });
});
