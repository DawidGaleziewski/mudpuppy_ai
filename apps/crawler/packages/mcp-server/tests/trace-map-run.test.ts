import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PHASE_NAMES } from '@pathfinder/core';
import { canLaunchBrowser } from '@pathfinder/crawler';
import { startMockPortal, type MockPortal } from './mock-portal.js';
import { normaliseRows } from './trace-normalise.js';
import { scriptedTraceRun, setupTraceRun, type TraceCall } from './trace-run-harness.js';

const available = await canLaunchBrowser();

let portal: MockPortal;
beforeAll(async () => {
  if (available) portal = await startMockPortal({ MOCK_TRACE_PAGES: true });
});
afterAll(async () => portal?.close());

const setup = (maxSteps = 4) => setupTraceRun(portal, { maxSteps });
const scriptedRun = (call: TraceCall) => scriptedTraceRun(call, portal.origin);

describe.skipIf(!available)('trace of a map run against the mock portal', () => {
  it('breaks every completed navigate/act into contract phases that add up to the call (SC-003)', async () => {
    const { call, spans, cleanup } = await setup();
    try {
      const runId = await scriptedRun(call);
      const rows = spans();
      const calls = rows.filter((r) => r.kind === 'call');
      expect(calls.map((c) => c.name)).toContain('act');
      for (const c of calls) expect(c.run_id).toBe(runId);
      const browserCalls = calls.filter(
        (c) => (c.name === 'navigate' || c.name === 'act') && c.status === 'ok',
      );
      expect(browserCalls.length).toBeGreaterThanOrEqual(2);
      for (const c of browserCalls) {
        const phases = rows.filter((r) => r.kind === 'phase' && r.parent_id === c.id);
        expect(phases.length).toBeGreaterThan(0);
        for (const p of phases) expect(PHASE_NAMES).toContain(p.name);
        const sum = phases.reduce((acc, p) => acc + (p.duration_ms as number), 0);
        const total = c.duration_ms as number;
        // 5% (SC-003) plus 1 ms per phase for per-row millisecond rounding.
        expect(Math.abs(total - sum)).toBeLessThanOrEqual(total * 0.05 + phases.length);
        const names = phases.map((p) => p.name);
        expect(names).toEqual(
          expect.arrayContaining([
            'begin_step',
            'gate',
            'settle',
            'observe',
            'fingerprint',
            'record_state',
          ]),
        );
      }
      const start = calls.find((c) => c.name === 'start_run')!;
      const startPhases = rows
        .filter((r) => r.parent_id === start.id && r.kind === 'phase')
        .map((r) => r.name);
      expect(startPhases).toEqual(
        expect.arrayContaining([
          'preflight',
          'robots_fetch',
          'insert_run',
          'open_session',
          'restore_index',
        ]),
      );
      const finish = calls.find((c) => c.name === 'finish_run')!;
      expect(rows.filter((r) => r.parent_id === finish.id).map((r) => r.name)).toContain(
        'complete_run',
      );
    } finally {
      await cleanup();
    }
  });

  it('two runs of the same script give the same span tree (SC-007, browser variant)', async () => {
    // Timing-dependent detail (request counts, limiter waits, background polling) is left out.
    const TIMING = new Set([
      'request',
      'request_aggregate',
      'limiter_wait',
      'stabilization_timeout',
      'trace_health',
    ]);
    const tree = async () => {
      const { call, spans, cleanup } = await setup();
      try {
        await scriptedRun(call);
        const rows = spans().filter((r) => r.between_calls === 0 && !TIMING.has(r.name as string));
        return normaliseRows(
          rows.map((r) => ({
            id: r.id,
            parent_id: r.parent_id,
            kind: r.kind,
            name: r.name,
            status: r.status,
          })),
        );
      } finally {
        await cleanup();
      }
    };
    const first = await tree();
    expect(first.length).toBeGreaterThan(20);
    expect(await tree()).toEqual(first);
  });
});
