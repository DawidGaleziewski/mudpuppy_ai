import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { AGENT_TOOL_NAMES, BA_TOOL_NAMES, createServer, type Runtime } from '../src/index.js';
import { CONTENT, startBa } from './ba-harness.js';
import { makeCtx } from './helpers.js';

const repoFile = (p: string) => fileURLToPath(new URL(`../../../../../${p}`, import.meta.url));

interface JsonSchema {
  properties?: Record<string, JsonSchema & { description?: string }>;
  items?: JsonSchema;
}

async function baTools() {
  const { client } = await startBa();
  return (await client.listTools()).tools;
}

describe('BA server lockdown (contracts/ba-mcp-tools.md)', () => {
  it('lists exactly the 15 BA tools (13 of R-13 plus the R-14 process reads)', async () => {
    expect(BA_TOOL_NAMES).toEqual([
      'list_runs',
      'get_run_evidence',
      'get_evidence',
      'list_records',
      'get_record',
      'list_processes',
      'get_process',
      'get_pending_feedback',
      'start_session',
      'record_pass',
      'finish_session',
      'create_record',
      'revise_record',
      'withdraw_record',
      'address_crawler_question',
    ]);
    const names = (await baTools()).map((t) => t.name).sort();
    expect(names).toEqual([...BA_TOOL_NAMES].sort());
  });

  it('exposes no crawler tool, and the crawler server exposes no BA tool', async () => {
    const ba = (await baTools()).map((t) => t.name);
    expect(ba.filter((n) => (AGENT_TOOL_NAMES as readonly string[]).includes(n))).toEqual([]);
    expect(
      ba.filter((n) => /navigate|act$|browser|click|fill|start_run|finish_run/.test(n)),
    ).toEqual([]);

    const ctx = await makeCtx();
    const runtime = {
      openSession: async () => {},
      navigate: async () => ({}),
      act: async () => ({}),
      closeAll: async () => {},
    } as unknown as Runtime;
    const server = createServer(ctx, runtime);
    const client = new Client({ name: 't', version: '0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    const crawler = (await client.listTools()).tools.map((t) => t.name);
    expect(crawler.filter((n) => (BA_TOOL_NAMES as readonly string[]).includes(n))).toEqual([]);
  });

  it('has no input that sets a status, a key or an id', async () => {
    const tools = await baTools();
    const props = (name: string) =>
      Object.keys((tools.find((t) => t.name === name)!.inputSchema as JsonSchema).properties ?? {});
    for (const t of tools) {
      expect(props(t.name), t.name).not.toContain('id');
      expect(props(t.name), t.name).not.toContain('record_id');
      expect(props(t.name), t.name).not.toContain('rev_no');
    }
    // `key` only names an existing record to look up; nothing lets the agent choose a new one.
    expect(
      tools
        .filter((t) => props(t.name).includes('key'))
        .map((t) => t.name)
        .sort(),
    ).toEqual(['get_record', 'revise_record', 'withdraw_record']);
    // `status` exists only as a read filter on list_records.
    expect(tools.filter((t) => props(t.name).includes('status')).map((t) => t.name)).toEqual([
      'list_records',
    ]);
  });

  it('accepts an evidence run_id only to pick the observation run of a state', async () => {
    const tools = await baTools();
    for (const name of ['create_record', 'revise_record', 'withdraw_record']) {
      const schema = tools.find((t) => t.name === name)!.inputSchema as JsonSchema;
      const item = schema.properties!.evidence!.items!;
      expect(Object.keys(item.properties!).sort()).toEqual([
        'note',
        'run_id',
        'target_id',
        'target_kind',
      ]);
      expect(item.properties!.run_id!.description).toMatch(/only on a state link/i);
    }
    // And the server enforces it.
    const { fx, session, refused } = await startBa();
    const error = await refused('create_record', {
      session_id: await session(),
      kind: 'screen',
      content: CONTENT.screen,
      confidence: 'observed',
      evidence: [{ target_kind: 'form', target_id: fx.forms.vehicle, run_id: fx.runId }],
    });
    expect(error.code).toBe('SCHEMA_INVALID');
  });

  it('ignores a status the agent tries to pass: a new revision is always a draft', async () => {
    const { fx, session, must } = await startBa();
    const { key } = await must('create_record', {
      session_id: await session(),
      kind: 'screen',
      content: CONTENT.screen,
      confidence: 'observed',
      evidence: [{ target_kind: 'state', target_id: fx.states.vehicle }],
      status: 'confirmed',
      key: 'SCR-999',
    });
    expect(key).toBe('SCR-001');
    const record = await must('get_record', { portal_id: fx.portalId, key });
    expect(record.revisions[0].status).toBe('draft');
    expect(record.confirmed_rev).toBeNull();
  });
});

describe('ba subagent lockdown', () => {
  const text = readFileSync(repoFile('.claude/agents/ba.md'), 'utf8');
  const tools = /^tools:\s*(.+)$/m
    .exec(text)![1]!
    .split(',')
    .map((t) => t.trim());

  it('lists exactly the BA tools plus Read', () => {
    expect([...tools].sort()).toEqual(
      [...BA_TOOL_NAMES.map((n) => `mcp__pathfinder-ba__${n}`), 'Read'].sort(),
    );
  });

  it('has no shell, write, web, crawler or wildcard tool', () => {
    for (const t of tools) {
      expect(t).not.toMatch(
        /^(Bash|Edit|Write|MultiEdit|NotebookEdit|WebFetch|WebSearch|Task|Agent)\b/,
      );
      expect(t).not.toContain('*');
      expect(t.startsWith('mcp__pathfinder__')).toBe(false);
    }
  });

  it('.mcp.json registers the pathfinder-ba server on the BA entry point', () => {
    const mcp = JSON.parse(readFileSync(repoFile('.mcp.json'), 'utf8')) as {
      mcpServers: Record<string, { type?: string; command: string; args: string[] }>;
    };
    const ba = mcp.mcpServers['pathfinder-ba']!;
    expect(ba).toBeDefined();
    expect(ba.type ?? 'stdio').toBe('stdio');
    expect(ba.args).toContain('start:ba');
    expect(mcp.mcpServers.pathfinder!.args).not.toContain('start:ba');
  });
});
