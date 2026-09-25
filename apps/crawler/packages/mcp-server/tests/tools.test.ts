import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AGENT_TOOL_NAMES, createServer, type Runtime } from '../src/index.js';
import { FP, REF, makeCtx, seedRun } from './helpers.js';
import { recordState } from '../src/index.js';

function fakeRuntime(): Runtime & { openSession: ReturnType<typeof vi.fn> } {
  return {
    openSession: vi.fn(async () => {}),
    navigate: vi.fn(async () => {
      throw new Error('boom: secret internals');
    }),
    act: vi.fn(async () => ({
      state_id: 's',
      created: false,
      cluster_id: 'c',
      title: 't',
      route_template: '/',
      forms: 0,
      actions: [],
      edge_id: 'e',
    })),
    closeAll: vi.fn(async () => {}),
  };
}

async function connect() {
  const ctx = await makeCtx();
  const runtime = fakeRuntime();
  const server = createServer(ctx, runtime);
  const client = new Client({ name: 't', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    return {
      isError: r.isError === true,
      body: JSON.parse((r.content as { text: string }[])[0]!.text),
    };
  };
  return { ctx, runtime, client, call };
}

describe('pathfinder tools', () => {
  it('exposes exactly the agent-facing tools and no recording service or complete_run', async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([...AGENT_TOOL_NAMES].sort());
    for (const hidden of [
      'record_state',
      'record_transition',
      'record_form',
      'record_api_call',
      'add_frontier_item',
      'complete_run',
    ]) {
      expect(names).not.toContain(hidden);
    }
  });

  it('maps ToolErrors to structured isError results with the code', async () => {
    const { call } = await connect();
    const r = await call('get_known_states', { run_id: 'ghost' });
    expect(r).toMatchObject({ isError: true, body: { error: { code: 'RUN_NOT_FOUND' } } });
  });

  it('does not leak internal error details', async () => {
    const { ctx, call } = await connect();
    const run = await seedRun(ctx);
    const r = await call('navigate', { run_id: run, url: 'https://x.pl/' });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain('secret internals');
    expect(r.body.error.code).toBe('INTERNAL');
  });

  it('rejects malformed input at the protocol layer (client-chosen fields)', async () => {
    const { client } = await connect();
    const r = await client
      .callTool({ name: 'get_known_states', arguments: {} })
      .catch((e: Error) => e);
    expect(r instanceof Error || (r as { isError?: boolean }).isError).toBeTruthy();
  });

  it('start_run refuses before opening a session', async () => {
    const { ctx, runtime, call } = await connect();
    mkdirSync(join(ctx.root, 'portals'), { recursive: true });
    const r = await call('start_run', { portal_id: 'shop', persona_id: 'guest' });
    expect(r).toMatchObject({ isError: true, body: { error: { code: 'PORTAL_NOT_FOUND' } } });
    expect(runtime.openSession).not.toHaveBeenCalled();
  });

  it('start_run opens a session only after a successful preflight', async () => {
    const { ctx, runtime, call } = await connect();
    const files: Record<string, string> = {
      'portals/shop/portal.yaml': `id: shop\nbase_url: https://shop.pl/\nenvironment: production\ncompliance: { robots_checked_on: 2026-09-20, terms_reviewed_on: 2026-09-21, terms_reviewed_by: me }\nscope: { allowed_domains: [shop.pl], allowed_paths: ["/*"], max_depth: 3, max_states: 10, max_actions_per_state: 5, max_run_time_minutes: 5, max_steps: 50 }\nrate_limit: { requests_per_second: 1, max_concurrency: 1, user_agent: "Bot (+ops@corp.pl)" }\n`,
      'personas/shop/guest.yaml': 'id: guest\nviewport: { width: 1, height: 1 }\nlocale: pl-PL\n',
    };
    for (const [rel, c] of Object.entries(files)) {
      mkdirSync(dirname(join(ctx.root, rel)), { recursive: true });
      writeFileSync(join(ctx.root, rel), c);
    }
    const r = await call('start_run', { portal_id: 'shop', persona_id: 'guest' });
    expect(r.isError).toBe(false);
    expect(r.body).toMatchObject({
      resumed: false,
      effective_max_action_class: 'read',
      budgets: { steps: 50 },
    });
    expect(runtime.openSession).toHaveBeenCalledOnce();
  });

  it('start_run interrupts the run and names the failure when the browser does not launch', async () => {
    const { ctx, runtime, call } = await connect();
    runtime.openSession.mockRejectedValueOnce(new Error('libnspr4.so: cannot open shared object'));
    const files: Record<string, string> = {
      'portals/shop/portal.yaml': `id: shop\nbase_url: https://shop.pl/\nenvironment: production\ncompliance: { robots_checked_on: 2026-09-20, terms_reviewed_on: 2026-09-21, terms_reviewed_by: me }\nscope: { allowed_domains: [shop.pl], allowed_paths: ["/*"], max_depth: 3, max_states: 10, max_actions_per_state: 5, max_run_time_minutes: 5, max_steps: 50 }\nrate_limit: { requests_per_second: 1, max_concurrency: 1, user_agent: "Bot (+ops@corp.pl)" }\n`,
      'personas/shop/guest.yaml': 'id: guest\nviewport: { width: 1, height: 1 }\nlocale: pl-PL\n',
    };
    for (const [rel, c] of Object.entries(files)) {
      mkdirSync(dirname(join(ctx.root, rel)), { recursive: true });
      writeFileSync(join(ctx.root, rel), c);
    }
    const r = await call('start_run', { portal_id: 'shop', persona_id: 'guest' });
    expect(r).toMatchObject({ isError: true, body: { error: { code: 'BROWSER_UNAVAILABLE' } } });
    expect(JSON.stringify(r.body)).not.toContain('libnspr4');
    const run = await ctx.db
      .selectFrom('runs')
      .select(['status', 'ended_at'])
      .where('id', '=', r.body.error.run_id)
      .executeTakeFirstOrThrow();
    expect(run.status).toBe('interrupted');
    expect(run.ended_at).not.toBeNull();
  });

  it('serves the read tools end to end', async () => {
    const { ctx, call } = await connect();
    const run = await seedRun(ctx);
    const s = await recordState(ctx, {
      run_id: run,
      fingerprint: FP('a'),
      cluster_id: 'c',
      route_template: '/a',
      title: 'A',
      evidence_ref: REF,
      confidence: 'observed',
    });
    expect((await call('get_known_states', { run_id: run })).body.states).toHaveLength(1);
    expect(
      (await call('add_rule_candidate', { run_id: run, text: 'x', about_ref: s.state_id })).isError,
    ).toBe(false);
    expect((await call('get_next_frontier_item', { run_id: run })).body).toEqual({
      item: null,
      reason: 'empty',
    });
    expect((await call('finish_run', { run_id: run })).body.status).toBe('completed');
    expect((await call('get_next_frontier_item', { run_id: run })).body.error.code).toBe(
      'RUN_STOPPED',
    );
  });
});
