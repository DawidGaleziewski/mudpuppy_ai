import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createLogger, createTracer } from '@pathfinder/core';
import { canLaunchBrowser } from '@pathfinder/crawler';
import { createServer, type Runtime } from '../src/index.js';
import { makeCtx, seedRun } from './helpers.js';
import { startMockPortal, type MockPortal } from './mock-portal.js';
import { normaliseRows } from './trace-normalise.js';
import { scriptedTraceRun, setupTraceRun } from './trace-run-harness.js';

const available = await canLaunchBrowser();

let portal: MockPortal;
beforeAll(async () => {
  if (available) portal = await startMockPortal({ MOCK_TRACE_PAGES: true });
});
afterAll(async () => portal?.close());

/** What the crawl recorded, minus ids, timestamps and elapsed time (they differ between any two runs). */
function crawlRows(raw: Awaited<ReturnType<typeof setupTraceRun>>['ctx']['raw']) {
  const q = (sql: string) => raw.prepare(sql).all() as Record<string, unknown>[];
  return normaliseRows([
    q('SELECT status, warning, steps_used, max_depth_reached, coverage FROM runs ORDER BY id'),
    q(
      'SELECT fingerprint, cluster_id, route_template, title, confidence, stabilization FROM states ORDER BY id',
    ),
    q(
      `SELECT fs.fingerprint AS from_fp, ts.fingerprint AS to_fp, e.action_json, e.safety_class, e.status, e.confidence, e.error
       FROM edges e JOIN states fs ON fs.id = e.from_state LEFT JOIN states ts ON ts.id = e.to_state ORDER BY e.id`,
    ),
    q(
      'SELECT action_json, safety_class, status, priority, depth, reason FROM frontier ORDER BY id',
    ),
    q('SELECT kind, rule, reason, detail_json FROM decision_log ORDER BY id'),
  ]);
}

describe.skipIf(!available)('a broken trace never changes the crawl (FR-014)', () => {
  it('records the same crawl with trace_spans dropped mid-run, and counts what it dropped', async () => {
    const traced = await setupTraceRun(portal);
    const broken = await setupTraceRun(portal);
    try {
      await scriptedTraceRun(traced.call, portal.origin);
      let brokenRun = '';
      await scriptedTraceRun(broken.call, portal.origin, {
        afterStart: (runId) => {
          brokenRun = runId;
          broken.ctx.raw.exec('DROP TABLE trace_spans');
        },
      });
      const expected = crawlRows(traced.ctx.raw);
      expect((expected[1] as unknown[]).length).toBeGreaterThan(1); // states
      expect((expected[4] as unknown[]).length).toBeGreaterThan(1); // decisions
      expect(crawlRows(broken.ctx.raw)).toEqual(expected);
      expect(broken.ctx.tracer.health(brokenRun).dropped).toBeGreaterThan(0);
    } finally {
      await traced.cleanup();
      await broken.cleanup();
    }
  });
});

describe('a crashed server leaves its in-flight call unfinished', () => {
  it('marks the running call of the earlier boot unfinished when a new server starts on the store', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    let release!: () => void;
    const hang = new Promise<void>((r) => (release = r));
    const runtime: Runtime = {
      openSession: vi.fn(async () => {}),
      navigate: vi.fn(async () => {
        await hang;
        throw new Error('the process died here');
      }),
      act: vi.fn(),
      closeAll: vi.fn(async () => {}),
    };
    const client = new Client({ name: 't', version: '0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([createServer(ctx, runtime).connect(a), client.connect(b)]);
    const inFlight = client.callTool({
      name: 'navigate',
      arguments: { run_id: run, url: 'https://shop.pl/' },
    });
    await vi.waitFor(() =>
      expect(
        ctx.raw.prepare("SELECT status FROM trace_spans WHERE name = 'navigate'").get(),
      ).toEqual({
        status: 'running',
      }),
    );

    // A new server process on the same database.
    const next = createTracer({
      db: ctx.db,
      logger: createLogger({ level: 'silent' }),
      evidence: ctx.evidence,
      level: 'standard',
    });
    await next.start({
      environment: 'production',
      server: 'pathfinder',
      version: 'test',
      pwTrace: 'non_production',
    });
    expect(await next.sweepUnfinished()).toBe(1);
    expect(
      ctx.raw
        .prepare("SELECT status, ended_at, duration_ms FROM trace_spans WHERE name = 'navigate'")
        .get(),
    ).toEqual({
      status: 'unfinished',
      ended_at: null,
      duration_ms: null,
    });
    await next.shutdown();
    release();
    await inFlight;
  });
});
