import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@mudpuppy/crawler';
import { startMockPortal, type MockPortal } from './mock-portal.js';
import { portalYaml, scriptedTraceRun, setupTraceRun } from './trace-run-harness.js';

const available = await canLaunchBrowser();
let portal: MockPortal;
beforeAll(async () => {
  if (available) portal = await startMockPortal();
});
afterAll(async () => portal?.close());

describe.skipIf(!available)('Playwright trace chunks', () => {
  it('writes one zip per browser call of a sandbox run and links it from the call span', async () => {
    const { ctx, call, spans, cleanup } = await setupTraceRun(portal);
    try {
      const runId = await scriptedTraceRun(call, portal.origin);
      const browserCalls = spans().filter(
        (r) => r.kind === 'call' && (r.name === 'navigate' || r.name === 'act'),
      );
      expect(browserCalls.length).toBeGreaterThanOrEqual(2);
      for (const c of browserCalls) {
        expect(c.pw_trace_path).toBe(`traces/mock/${runId}/${String(c.seq)}-${String(c.name)}.zip`);
        const file = join(ctx.root, 'data', c.pw_trace_path as string);
        expect(statSync(file).size).toBeGreaterThan(0);
      }
      const dir = join(ctx.root, 'data', 'traces', 'mock', runId);
      expect(readdirSync(dir).sort()).toEqual(
        browserCalls.map((c) => `${String(c.seq)}-${String(c.name)}.zip`).sort(),
      );
      for (const c of spans().filter(
        (r) => r.kind === 'call' && r.name !== 'navigate' && r.name !== 'act',
      ))
        expect(c.pw_trace_path).toBeNull();
    } finally {
      await cleanup();
    }
  });

  it('traces a production portal like any other (spec 021)', async () => {
    const { ctx, call, spans, cleanup } = await setupTraceRun(portal);
    try {
      ctx.dbEnvironment = 'production';
      writeFileSync(
        join(ctx.root, 'portals/mock/portal.yaml'),
        portalYaml(portal.origin, 4).replace('environment: sandbox', 'environment: production'),
      );
      const runId = await scriptedTraceRun(call, portal.origin);
      expect(
        spans().some((r) => r.kind === 'call' && r.name === 'navigate' && r.pw_trace_path),
      ).toBe(true);
      expect(existsSync(join(ctx.root, 'data', 'traces', 'mock', runId))).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
