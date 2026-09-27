import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PHASE_NAMES } from '@pathfinder/core';
import { canLaunchBrowser } from '@pathfinder/crawler';
import { createBrowserRuntime, createServer } from '../src/index.js';
import { makeCtx } from './helpers.js';
import { startMockPortal, type MockPortal } from './mock-portal.js';

const available = await canLaunchBrowser();

const portalYaml = (origin: string, maxSteps: number) => `
id: mock
base_url: ${origin}/
environment: sandbox
compliance: { robots_checked_on: 2026-09-20, terms_reviewed_on: 2026-09-21, terms_reviewed_by: me }
scope:
  allowed_domains: [127.0.0.1]
  allowed_paths: ["/*"]
  external_link_policy: record
  max_depth: 6
  max_states: 100
  max_actions_per_state: 50
  max_run_time_minutes: 5
  max_steps: ${maxSteps}
denylist: [logout, delete, payment, bidding, buy_now, message_or_contact_seller, reveal_seller_contact]
obstacles:
  - { id: cookie_banner, selector: "#cookie button.accept" }
rate_limit: { requests_per_second: 20, max_concurrency: 1, user_agent: "PathfinderAI-Crawler/0.1 (+ops@corp.pl)" }
item_route_templates: ["/oferta/:id"]
`;
const PERSONA =
  'id: guest\nauth: none\nmax_action_class: read\nviewport: { width: 1280, height: 800 }\nlocale: pl-PL\n';

let portal: MockPortal;
beforeAll(async () => {
  if (available) portal = await startMockPortal({ MOCK_TRACE_PAGES: true });
});
afterAll(async () => portal?.close());

type Row = Record<string, unknown>;

async function setup(maxSteps = 4) {
  const ctx = await makeCtx();
  ctx.dbEnvironment = 'sandbox';
  ctx.fetch = fetch;
  for (const [rel, c] of Object.entries({
    'portals/mock/portal.yaml': portalYaml(portal.origin, maxSteps),
    'personas/mock/guest.yaml': PERSONA,
  })) {
    mkdirSync(dirname(join(ctx.root, rel)), { recursive: true });
    writeFileSync(join(ctx.root, rel), c);
  }
  const runtime = createBrowserRuntime({
    stabilizer: { networkIdleMs: 150, domQuietMs: 100, timeoutMs: 2000, pollMs: 25 },
  });
  const server = createServer(ctx, runtime);
  const client = new Client({ name: 'agent', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    return {
      isError: r.isError === true,
      body: JSON.parse((r.content as { text: string }[])[0]!.text) as Record<string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
    };
  };
  const spans = () => ctx.raw.prepare('SELECT * FROM trace_spans ORDER BY seq').all() as Row[];
  return { ctx, call, spans, cleanup: () => runtime.closeAll() };
}

/** start_run → navigate home → act ×3 (server's frontier order) → finish_run. */
async function scriptedRun(call: Awaited<ReturnType<typeof setup>>['call']): Promise<string> {
  const start = await call('start_run', { portal_id: 'mock', persona_id: 'guest' });
  if (start.isError) throw new Error(JSON.stringify(start.body));
  const runId = start.body.run_id as string;
  await call('navigate', { run_id: runId, url: `${portal.origin}/` });
  for (let i = 0; i < 3; i++) {
    const next = await call('get_next_frontier_item', { run_id: runId });
    if (!next.body.item) break;
    await call('act', { run_id: runId, action_id: next.body.item.action_id });
  }
  await call('finish_run', { run_id: runId });
  return runId;
}

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
});
