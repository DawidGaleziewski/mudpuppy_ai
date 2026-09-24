import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createBrowserRuntime, createServer } from '../src/index.js';
import { makeCtx } from './helpers.js';

export type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Call = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ isError: boolean; body: Body }>;

/**
 * An MCP server with the real browser runtime on a sandbox database, and the given config files
 * (`portals/<p>/portal.yaml`, `personas/<p>/<persona>.yaml`) written under a scratch root.
 * Pass `ctx` to reuse one database for several portals.
 */
export async function startHarness(
  files: Record<string, string>,
  existing?: Awaited<ReturnType<typeof makeCtx>>,
) {
  const ctx = existing ?? (await makeCtx());
  ctx.dbEnvironment = 'sandbox';
  ctx.fetch = fetch; // mock portals serve their own robots.txt on localhost
  for (const [rel, c] of Object.entries(files)) {
    mkdirSync(dirname(join(ctx.root, rel)), { recursive: true });
    writeFileSync(join(ctx.root, rel), c);
  }
  const runtime = createBrowserRuntime({
    stabilizer: { networkIdleMs: 150, domQuietMs: 100, timeoutMs: 5000, pollMs: 25 },
  });
  const server = createServer(ctx, runtime);
  const client = new Client({ name: 'agent', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call: Call = async (name, args) => {
    const r = await client.callTool({ name, arguments: args });
    return {
      isError: r.isError === true,
      body: JSON.parse((r.content as { text: string }[])[0]!.text),
    };
  };
  return { ctx, runtime, call, cleanup: () => runtime.closeAll() };
}

/** The agent loop: follow the server's frontier until it is empty. */
export async function crawl(call: Call, runId: string, maxSteps = 60): Promise<void> {
  for (let i = 0; i < maxSteps; i++) {
    const next = await call('get_next_frontier_item', { run_id: runId });
    if (next.isError || !next.body.item) return;
    await call('act', { run_id: runId, action_id: next.body.item.action_id });
  }
}

/** start_run, navigate to the base URL, crawl, finish_run; returns the run id. */
export async function mapPortal(
  call: Call,
  portalId: string,
  baseUrl: string,
  personaId = 'guest',
): Promise<string> {
  const start = await call('start_run', { portal_id: portalId, persona_id: personaId });
  if (start.isError) throw new Error(`start_run failed: ${JSON.stringify(start.body)}`);
  const runId = start.body.run_id as string;
  await call('navigate', { run_id: runId, url: baseUrl });
  await crawl(call, runId, 300);
  const fin = await call('finish_run', { run_id: runId });
  if (fin.isError) throw new Error(`finish_run failed: ${JSON.stringify(fin.body)}`);
  return runId;
}
