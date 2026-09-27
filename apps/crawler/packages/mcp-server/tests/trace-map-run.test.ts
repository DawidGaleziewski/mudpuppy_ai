import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PHASE_NAMES } from '@pathfinder/core';
import { canLaunchBrowser } from '@pathfinder/crawler';
import { startMockPortal, type MockPortal } from './mock-portal.js';
import { normaliseRows } from './trace-normalise.js';
import {
  portalYaml,
  scriptedTraceRun,
  setupTraceRun,
  type TraceCall,
} from './trace-run-harness.js';

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

  it('links every decision to one decision span and shows safety events inside their calls (US2)', async () => {
    const { ctx, call, spans, cleanup } = await setup(10);
    try {
      const start = await call('start_run', { portal_id: 'mock', persona_id: 'guest' });
      const runId = start.body.run_id as string;
      await call('navigate', { run_id: runId, url: `${portal.origin}/` });
      await call('navigate', { run_id: runId, url: `${portal.origin}/with-disallowed-asset` });
      const refused = await call('navigate', { run_id: runId, url: `${portal.origin}/wyloguj` });
      expect(refused.body.error.code).toBe('ACTION_REFUSED');
      await ctx.tracer.flush();
      const rows = spans();

      // SC-002: every decision_log row of the run has exactly one decision span.
      const decisions = ctx.raw
        .prepare('SELECT id FROM decision_log WHERE run_id = ?')
        .all(runId) as { id: string }[];
      const linked = rows.filter((r) => r.name === 'decision' && r.run_id === runId);
      expect(linked.map((r) => r.decision_id).sort()).toEqual(decisions.map((d) => d.id).sort());

      const navs = rows.filter((r) => r.kind === 'call' && r.name === 'navigate');
      const assetCall = navs[1]!;
      const robots = rows.filter((r) => r.name === 'robots_check');
      expect(robots).toHaveLength(2);
      for (const r of robots) {
        expect(r.parent_id).toBe(assetCall.id);
        expect(JSON.parse(r.attrs_json as string)).toMatchObject({
          url: { route: expect.stringMatching(/^\/admin\//), query_keys: [] },
        });
      }

      const refusedCall = navs[2]!;
      expect(refusedCall.status).toBe('refused');
      const gate = rows.find(
        (r) => r.name === 'gate_decision' && r.run_id === runId && isUnder(rows, r, refusedCall.id),
      )!;
      expect(JSON.parse(gate.attrs_json as string)).toMatchObject({
        input_kind: 'navigate',
        allowed: false,
      });

      const agg = rows.filter((r) => r.name === 'request_aggregate');
      expect(agg.length).toBeGreaterThan(0);
      const mainFrame = rows.filter(
        (r) => r.name === 'request' && JSON.parse(r.attrs_json as string).main_frame === true,
      );
      expect(mainFrame.length).toBeGreaterThan(0);
      expect(JSON.stringify(rows)).not.toContain(portal.origin + '/with');
    } finally {
      await cleanup();
    }
  });

  it('explains mapping and page behaviour: settle timeouts, fingerprints, frontier, run status (US4)', async () => {
    const { call, spans, cleanup } = await setup(10);
    try {
      const start = await call('start_run', { portal_id: 'mock', persona_id: 'guest' });
      const runId = start.body.run_id as string;
      await call('navigate', { run_id: runId, url: `${portal.origin}/` });
      const next = await call('get_next_frontier_item', { run_id: runId });
      await call('act', { run_id: runId, action_id: next.body.item.action_id });
      await call('navigate', { run_id: runId, url: `${portal.origin}/polling` });
      const rows = spans();
      const attrs = (r: Record<string, unknown>) => JSON.parse(r.attrs_json as string);
      const byName = (n: string) => rows.filter((r) => r.name === n);

      const polling = rows.filter((r) => r.kind === 'call' && r.name === 'navigate')[1]!;
      const timeout = byName('stabilization_timeout').find((r) => isUnder(rows, r, polling.id))!;
      expect(timeout).toBeDefined();
      const t = attrs(timeout);
      expect(t.in_flight.map((f: { url: { route: string } }) => f.url.route)).toContain(
        '/api/poll',
      );
      expect(t).toMatchObject({
        timeout_ms: expect.any(Number),
        running_animations: expect.anything(),
      });
      expect(rows.find((r) => r.id === timeout.parent_id)!.name).toBe('settle');

      const fp = attrs(byName('fingerprint_assign')[0]!);
      expect(fp).toMatchObject({
        route_template: '/',
        level1: expect.stringMatching(/^[0-9a-f]{64}$/),
        decision: expect.any(String),
        cluster_id: expect.any(String),
        similarity: expect.any(Number),
        threshold: expect.any(Number),
      });
      expect(attrs(byName('state_recorded')[0]!)).toMatchObject({
        created: true,
        evidence_ref: expect.stringMatching(/\.yaml$/),
      });
      const enq = byName('frontier_enqueue');
      expect(enq.length).toBeGreaterThan(0);
      expect(attrs(enq[0]!)).toMatchObject({
        frontier_id: expect.any(String),
        action: { role: expect.any(String) },
        safety_class: 'read',
        priority: expect.any(Number),
        depth: expect.any(Number),
      });
      const skips = byName('frontier_skip').map(attrs);
      expect(skips.some((a) => a.rule && a.reason)).toBe(true);
      expect(attrs(byName('frontier_pick')[0]!)).toMatchObject({
        frontier_id: next.body.item.frontier_id,
        pending: expect.any(Number),
      });
      const status = byName('run_status').map(attrs);
      expect(status[0]).toMatchObject({ status: 'running', steps_used: 1 });
    } finally {
      await cleanup();
    }
  });

  it.skipIf(process.env.CI === '1')(
    'adds less than 10% to the median step time at standard vs off (SC-008)',
    async () => {
      // Production-declared so no Playwright trace is recorded in either run: this measures the span trace only.
      const median = async (level: 'off' | 'standard') => {
        const { ctx, call, spans, cleanup } = await setupTraceRun(portal, {
          maxSteps: 12,
          trace: { level },
        });
        try {
          ctx.dbEnvironment = 'production';
          writeFileSync(
            join(ctx.root, 'portals/mock/portal.yaml'),
            portalYaml(portal.origin, 12).replace(
              'environment: sandbox',
              'environment: production',
            ),
          );
          const start = await call('start_run', { portal_id: 'mock', persona_id: 'guest' });
          const runId = start.body.run_id as string;
          await call('navigate', { run_id: runId, url: `${portal.origin}/` });
          for (let i = 0; i < 10; i++) {
            const next = await call('get_next_frontier_item', { run_id: runId });
            if (!next.body.item) break;
            await call('act', { run_id: runId, action_id: next.body.item.action_id });
          }
          const d = spans()
            .filter(
              (r) =>
                r.kind === 'call' &&
                (r.name === 'navigate' || r.name === 'act') &&
                r.status === 'ok',
            )
            .map((r) => r.duration_ms as number)
            .sort((a, b) => a - b);
          return d[Math.floor(d.length / 2)]!;
        } finally {
          await cleanup();
        }
      };
      const off = await median('off');
      const standard = await median('standard');
      const increase = (standard - off) / off;
      const report = `SC-008: median step ${off} ms (off) vs ${standard} ms (standard): ${(increase * 100).toFixed(1)}%`;
      process.stderr.write(`${report}\n`);
      expect(increase, report).toBeLessThan(0.1);
    },
    120_000,
  );
});

/** Whether span `row` is a descendant of span `ancestorId`. */
function isUnder(
  rows: Record<string, unknown>[],
  row: Record<string, unknown>,
  ancestorId: unknown,
): boolean {
  let cur: Record<string, unknown> | undefined = row;
  while (cur && cur.parent_id) {
    if (cur.parent_id === ancestorId) return true;
    cur = rows.find((r) => r.id === cur!.parent_id);
  }
  return false;
}
