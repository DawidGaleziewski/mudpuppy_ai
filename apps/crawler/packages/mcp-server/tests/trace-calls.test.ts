import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AGENT_TOOL_NAMES, createServer, type Runtime } from '../src/index.js';
import { ToolError } from '../src/errors.js';
import { FP, REF, makeCtx, seedRun } from './helpers.js';
import { recordState } from '../src/index.js';

const PAGE = {
  state_id: 's',
  created: false,
  cluster_id: 'c',
  title: 't',
  route_template: '/',
  forms: 0,
  actions: [],
};

function fakeRuntime(): Runtime {
  return {
    openSession: vi.fn(async () => {}),
    navigate: vi.fn(async () => PAGE),
    act: vi.fn(async () => {
      throw new ToolError('ACTION_REFUSED', 'denylisted', { rule: 'denylist:delete' });
    }),
    closeAll: vi.fn(async () => {}),
  };
}

const PORTAL_FILES: Record<string, string> = {
  'portals/shop/portal.yaml': `id: shop\nbase_url: https://shop.pl/\nenvironment: production\ncompliance: { robots_checked_on: 2026-09-20, terms_reviewed_on: 2026-09-21, terms_reviewed_by: me }\nscope: { allowed_domains: [shop.pl], allowed_paths: ["/*"], max_depth: 3, max_states: 10, max_actions_per_state: 5, max_run_time_minutes: 5, max_steps: 50 }\nrate_limit: { requests_per_second: 1, max_concurrency: 1, user_agent: "Bot (+ops@corp.pl)" }\n`,
  'personas/shop/guest.yaml': 'id: guest\nviewport: { width: 1, height: 1 }\nlocale: pl-PL\n',
};

async function connect() {
  const ctx = await makeCtx();
  const server = createServer(ctx, fakeRuntime());
  const client = new Client({ name: 't', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  let n = 0;
  const call = async (
    name: string,
    args: Record<string, unknown>,
    meta?: Record<string, unknown>,
  ) => {
    const r = await client.callTool({
      name,
      arguments: args,
      _meta: meta ?? { 'claudecode/toolUseId': `toolu_${++n}`, 'claudecode/agentId': 'agent-1' },
    });
    return {
      isError: r.isError === true,
      body: JSON.parse((r.content as { text: string }[])[0]!.text),
    };
  };
  const spans = () =>
    ctx.raw.prepare('SELECT * FROM trace_spans ORDER BY seq').all() as Record<string, unknown>[];
  const calls = () => spans().filter((s) => s.kind === 'call');
  const writeFiles = (files: Record<string, string>) => {
    for (const [rel, c] of Object.entries(files)) {
      mkdirSync(dirname(join(ctx.root, rel)), { recursive: true });
      writeFileSync(join(ctx.root, rel), c);
    }
  };
  return { ctx, call, spans, calls, writeFiles };
}

const attrs = (row: Record<string, unknown>) =>
  JSON.parse(row.attrs_json as string) as Record<string, unknown>;

describe('call spans for the agent tools (US1)', () => {
  it('writes exactly one call span per tool call, for each of the eight tools', async () => {
    const { ctx, call, calls, writeFiles } = await connect();
    writeFiles(PORTAL_FILES);
    const start = await call('start_run', { portal_id: 'shop', persona_id: 'guest' });
    expect(start.isError).toBe(false);
    const run = start.body.run_id as string;
    const s = await recordState(ctx, {
      run_id: run,
      fingerprint: FP('a'),
      cluster_id: 'c',
      route_template: '/a',
      title: 'A',
      evidence_ref: REF,
      confidence: 'observed',
    });
    await call('get_known_states', { run_id: run });
    await call('get_next_frontier_item', { run_id: run });
    await call('navigate', {
      run_id: run,
      url: 'https://shop.pl/',
      rationale: 'exploring the target URL',
    });
    await call('act', {
      run_id: run,
      action_id: 'a1',
      rationale: 'exploring the next frontier item',
    });
    await call('add_open_question', { run_id: run, text: 'why', about_ref: s.state_id });
    await call('add_rule_candidate', { run_id: run, text: 'rule', about_ref: s.state_id });
    await call('finish_run', { run_id: run, rationale: 'frontier exhausted' });
    const rows = calls();
    expect(rows.map((r) => r.name)).toEqual([
      'start_run',
      'get_known_states',
      'get_next_frontier_item',
      'navigate',
      'act',
      'add_open_question',
      'add_rule_candidate',
      'finish_run',
    ]);
    expect(new Set(rows.map((r) => r.name))).toEqual(new Set(AGENT_TOOL_NAMES));
    for (const r of rows) expect(r.run_id).toBe(run);
    expect(rows.map((r) => r.tool_use_id)).toEqual(rows.map((_, i) => `toolu_${i + 1}`));
    for (const r of rows) {
      expect(r.agent_id).toBe('agent-1');
      expect(r.status).not.toBe('running');
      expect(r.duration_ms).toEqual(expect.any(Number));
      expect(attrs(r).request_id).toEqual(expect.anything());
    }
  });

  it('maps outcomes to statuses: ok, refused, stopped, error', async () => {
    const { ctx, call, calls, spans } = await connect();
    const run = await seedRun(ctx);
    await call('navigate', {
      run_id: run,
      url: 'https://shop.pl/',
      rationale: 'exploring the target URL',
    });
    const refused = await call('act', {
      run_id: run,
      action_id: 'a1',
      rationale: 'exploring the next frontier item',
    });
    expect(refused.body.error.code).toBe('ACTION_REFUSED');
    await call('get_known_states', { run_id: 'ghost' });
    await call('finish_run', { run_id: run, rationale: 'frontier exhausted' });
    await call('get_next_frontier_item', { run_id: run });
    expect(calls().map((r) => [r.name, r.status])).toEqual([
      ['navigate', 'ok'],
      ['act', 'refused'],
      ['get_known_states', 'error'],
      ['finish_run', 'ok'],
      ['get_next_frontier_item', 'stopped'],
    ]);
    const errors = spans().filter((r) => r.name === 'error');
    expect(errors.map((e) => attrs(e).code)).toEqual([
      'ACTION_REFUSED',
      'RUN_NOT_FOUND',
      'RUN_STOPPED',
    ]);
    const ghost = calls().find((r) => r.name === 'get_known_states')!;
    expect(ghost.run_id).toBeNull();
    expect(attrs(ghost).unknown_run_id).toBe('ghost');
  });

  it('stores the tool output and the scrubbed args on the call', async () => {
    const { ctx, call, calls } = await connect();
    const run = await seedRun(ctx);
    await call('navigate', {
      run_id: run,
      url: 'https://shop.pl/?mail=test.user@example.test',
      rationale: 'exploring the target URL',
    });
    const [nav] = calls();
    expect(attrs(nav!).output).toMatchObject({ state_id: 's', route_template: '/' });
    expect(JSON.stringify(attrs(nav!).args)).not.toContain('test.user@example.test');
    expect(attrs(nav!).args).toEqual({
      run_id: run,
      url: { origin: 'https://shop.pl', route: '/', query_keys: ['mail'] },
    });
  });

  it('keeps a start_run refused in preflight run-less, with an error event', async () => {
    const { call, calls, spans } = await connect();
    const r = await call('start_run', { portal_id: 'shop', persona_id: 'guest' });
    expect(r.body.error.code).toBe('PORTAL_NOT_FOUND');
    expect(calls()).toEqual([
      expect.objectContaining({ name: 'start_run', run_id: null, status: 'error' }),
    ]);
    expect(spans().find((s) => s.name === 'error')).toMatchObject({ run_id: null });
  });

  it('attaches a successful start_run to its run once the run row exists', async () => {
    const { call, calls, writeFiles } = await connect();
    writeFiles(PORTAL_FILES);
    const r = await call('start_run', { portal_id: 'shop', persona_id: 'guest' });
    expect(calls()[0]).toMatchObject({ name: 'start_run', status: 'ok', run_id: r.body.run_id });
  });

  it('works without _meta (tool_use_id and agent_id stay empty)', async () => {
    const { ctx, call, calls } = await connect();
    const run = await seedRun(ctx);
    await call('get_known_states', { run_id: run }, {});
    expect(calls()[0]).toMatchObject({ tool_use_id: null, agent_id: null, status: 'ok' });
  });

  it('stores the rationale masked', async () => {
    const { ctx, call, calls } = await connect();
    const run = await seedRun(ctx);
    await call('navigate', {
      run_id: run,
      url: 'https://shop.pl/',
      rationale: 'checking for test.user@example.test in the confirm dialog',
    });
    const [nav] = calls();
    expect(nav!.rationale).not.toContain('test.user@example.test');
    expect(nav!.rationale).toContain('[email]');
  });
});
