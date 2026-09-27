import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createServer, type Runtime } from '../src/index.js';
import { ToolError } from '../src/errors.js';
import { makeCtx } from './helpers.js';
import { normaliseRows } from './trace-normalise.js';

const PORTAL_FILES: Record<string, string> = {
  'portals/shop/portal.yaml': `id: shop\nbase_url: https://shop.pl/\nenvironment: production\ncompliance: { robots_checked_on: 2026-09-20, terms_reviewed_on: 2026-09-21, terms_reviewed_by: me }\nscope: { allowed_domains: [shop.pl], allowed_paths: ["/*"], max_depth: 3, max_states: 10, max_actions_per_state: 5, max_run_time_minutes: 5, max_steps: 50 }\nrate_limit: { requests_per_second: 1, max_concurrency: 1, user_agent: "Bot (+ops@corp.pl)" }\n`,
  'personas/shop/guest.yaml': 'id: guest\nviewport: { width: 1, height: 1 }\nlocale: pl-PL\n',
};

function fakeRuntime(): Runtime {
  return {
    openSession: vi.fn(async () => {}),
    navigate: vi.fn(async () => ({
      state_id: 's',
      created: true,
      cluster_id: 'c',
      title: 'Start',
      route_template: '/',
      forms: 0,
      actions: [
        {
          action_id: 'a1',
          role: 'link',
          accessible_name: 'Usuń konto',
          safety_class: 'destructive',
          allowed: false,
        },
      ],
    })),
    act: vi.fn(async () => {
      throw new ToolError('ACTION_REFUSED', 'denylisted', { rule: 'denylist:delete' });
    }),
    closeAll: vi.fn(async () => {}),
  };
}

/** Fixed wall clock, monotonic timer and span ids (research §4). */
function fixedTrace() {
  let t = Date.parse('2026-01-01T00:00:00.000Z');
  let m = 0;
  let i = 0;
  return {
    now: () => new Date((t += 1)),
    monotonic: () => (m += 5),
    newId: () => `00000000-0000-7000-8000-${String(++i).padStart(12, '0')}`,
  };
}

async function runScript(): Promise<Record<string, unknown>[]> {
  const ctx = await makeCtx(fixedTrace());
  for (const [rel, c] of Object.entries(PORTAL_FILES)) {
    mkdirSync(dirname(join(ctx.root, rel)), { recursive: true });
    writeFileSync(join(ctx.root, rel), c);
  }
  const server = createServer(ctx, fakeRuntime());
  const client = new Client({ name: 't', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  let n = 0;
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({
      name,
      arguments: args,
      _meta: { 'claudecode/toolUseId': `toolu_${++n}`, 'claudecode/agentId': 'agent-golden' },
    });
    const text = (r.content as { text: string }[])[0]!.text;
    if (!text.startsWith('{')) throw new Error(`${name}: ${text}`);
    return JSON.parse(text) as Record<string, unknown>;
  };
  await call('start_run', { portal_id: 'nope', persona_id: 'guest' });
  const start = await call('start_run', { portal_id: 'shop', persona_id: 'guest' });
  if (!start.run_id) throw new Error(JSON.stringify(start));
  const run = start.run_id as string;
  await call('get_known_states', { run_id: run });
  await call('navigate', { run_id: run, url: 'https://shop.pl/' });
  await call('get_next_frontier_item', { run_id: run });
  await call('act', { run_id: run, action_id: 'a1' });
  await call('finish_run', { run_id: run });
  await call('get_known_states', { run_id: 'ghost' });
  const rows = ctx.raw.prepare('SELECT * FROM trace_spans ORDER BY seq').all() as Record<
    string,
    unknown
  >[];
  return normaliseRows(rows);
}

describe('trace golden (SC-007)', () => {
  it('a scripted tool sequence produces the committed trace, identically on a second run', async () => {
    const first = await runScript();
    const second = await runScript();
    expect(second).toEqual(first);
    await expect(JSON.stringify(first, null, 2) + '\n').toMatchFileSnapshot(
      '__snapshots__/trace-golden.json',
    );
  });
});
