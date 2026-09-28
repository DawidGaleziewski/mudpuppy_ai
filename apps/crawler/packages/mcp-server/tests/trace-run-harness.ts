import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createBrowserRuntime, createServer } from '../src/index.js';
import { makeCtx, type TraceOverrides } from './helpers.js';
import type { MockPortal } from './mock-portal.js';

/** Mock-portal run setup shared by the trace e2e tests (real browser, sandbox database). */
export const portalYaml = (origin: string, maxSteps: number) => `
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

export type Row = Record<string, unknown>;
export type TraceCall = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ isError: boolean; body: Record<string, any> }>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function setupTraceRun(
  portal: MockPortal,
  opts: { maxSteps?: number; trace?: TraceOverrides } = {},
) {
  const ctx = await makeCtx(opts.trace);
  ctx.dbEnvironment = 'sandbox';
  ctx.fetch = fetch;
  for (const [rel, c] of Object.entries({
    'portals/mock/portal.yaml': portalYaml(portal.origin, opts.maxSteps ?? 4),
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
  const call: TraceCall = async (name, args) => {
    const r = await client.callTool({ name, arguments: args });
    return {
      isError: r.isError === true,
      body: JSON.parse((r.content as { text: string }[])[0]!.text),
    };
  };
  const spans = () => ctx.raw.prepare('SELECT * FROM trace_spans ORDER BY seq').all() as Row[];
  return { ctx, call, spans, cleanup: () => runtime.closeAll() };
}

/** start_run → navigate home → act ×3 (server's frontier order) → finish_run. */
export async function scriptedTraceRun(
  call: TraceCall,
  origin: string,
  hooks: { afterStart?: (runId: string) => void } = {},
): Promise<string> {
  const start = await call('start_run', { portal_id: 'mock', persona_id: 'guest' });
  if (start.isError) throw new Error(JSON.stringify(start.body));
  const runId = start.body.run_id as string;
  hooks.afterStart?.(runId);
  await call('navigate', {
    run_id: runId,
    url: `${origin}/`,
    rationale: 'exploring the home page',
  });
  for (let i = 0; i < 3; i++) {
    const next = await call('get_next_frontier_item', { run_id: runId });
    if (!next.body.item) break;
    await call('act', {
      run_id: runId,
      action_id: next.body.item.action_id,
      rationale: 'exploring the next frontier item',
    });
  }
  await call('finish_run', { run_id: runId, rationale: 'frontier exhausted' });
  return runId;
}
