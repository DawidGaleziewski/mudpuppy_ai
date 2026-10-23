// Spec 043 T017 (D-1): the Workbench session's tools. The model sees the designer's schemas; a bad
// component is dropped, not the call; one view per turn, one repair after a fallback; a command is
// only ever proposed.

import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateUp, openDb, type OpenedDb } from '@mudpuppy/store';
import { createChatMcpServer } from '../src/mcp-chat.js';

const repo = join(import.meta.dirname, '..', '..', '..');
const P = 'reference-insurer';
const CONV = '0199a000-0000-7000-8000-0000000000c2';
const RUN = '01a110d5-0000-7000-8000-000000000001';

let opened: OpenedDb;
let client: Client;
const raw = () => opened.raw;

function seed(): void {
  const at = '2026-10-06T10:00:00Z';
  raw()
    .prepare(
      `INSERT INTO chat_conversations (id, portal_id, goal, status, created_at, updated_at, kind)
       VALUES (?, ?, '', 'active', ?, ?, 'workbench')`,
    )
    .run(CONV, P, at, at);
  raw()
    .prepare(
      `INSERT INTO chat_messages (id, conversation_id, seq, role, content, created_at)
       VALUES ('m1', ?, 0, 'user', 'Map the calculator', ?)`,
    )
    .run(CONV, at);
  raw()
    .prepare(
      `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport,
         locale, browser, config_snapshot, status, started_at)
       VALUES (?, ?, 'guest', 'map', 'sandbox', '2026-10-06', '1280x800', 'pl-PL', 'chromium', '{}',
         'running', ?)`,
    )
    .run(RUN, P, at);
  raw()
    .prepare(
      `INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev,
         withdrawn, created_at, updated_at)
       VALUES ('rec-1', ?, 'business_rule', 'BR-021', 21, 'Driver age', 1, NULL, 0, ?, ?)`,
    )
    .run(P, at, at);
}

async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  return {
    isError: result.isError === true,
    body: result.structuredContent as Record<string, unknown> & { error?: { code: string } },
  };
}

const views = () =>
  raw().prepare(`SELECT turn, path, fallback, dropped_json FROM workbench_views`).all() as {
    turn: number;
    path: string;
    fallback: number;
    dropped_json: string;
  }[];

beforeEach(async () => {
  opened = openDb(':memory:');
  migrateUp(opened.raw, join(repo, 'data', 'migrations'));
  seed();
  const server = createChatMcpServer({
    raw: opened.raw,
    paths: { repoRoot: repo },
    conversationId: CONV,
    workbench: { phase: 1 },
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
});

afterEach(async () => {
  await client.close();
  await opened.close();
});

describe('Workbench tools', () => {
  it('offers only the two Workbench tools, with the designer’s schemas', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['propose_command', 'render_view']);
    const view = tools.find((t) => t.name === 'render_view');
    const schema = view?.inputSchema as { required?: string[]; $defs?: Record<string, unknown> };
    expect(schema.required).toEqual(['version', 'path', 'why', 'components']);
    expect(JSON.stringify(schema.$defs?.LiveMap)).toContain('"const":"LiveMap"');
    expect(JSON.stringify(schema.$defs?.scanId)).toContain('^[0-9a-f]{8}$');
  });

  it('a view keeps what is valid and drops the rest with its code', async () => {
    const { isError, body } = await call('render_view', {
      version: '1',
      path: 'mapping',
      why: 'You asked to map the calculator.',
      components: [
        { id: 'map', type: 'LiveMap', bind: { scan: '01a110d5' } },
        { id: 'x', type: 'HtmlBlock', bind: { html: '<b>hi</b>' } },
        { id: 'shot', type: 'StepShot', bind: { scan: '01a110d5', step: 3 } },
      ],
    });
    expect(isError).toBe(false);
    expect(body).toMatchObject({ turn: 1, path: 'mapping', shown: ['map'], fallback: false });
    expect(body.dropped).toEqual(['1:unknown_type', '2:not_on_path']);
    const path = raw()
      .prepare(`SELECT path, path_source FROM workbench_conversations WHERE conversation_id = ?`)
      .get(CONV);
    expect(path).toEqual({ path: 'mapping', path_source: 'assistant' });
  });

  it('one view per turn: a second call is ignored', async () => {
    const spec = { version: '1', path: 'chat', why: 'A short answer.', components: [] };
    await call('render_view', {
      ...spec,
      components: [{ id: 'p', type: 'RecordCard', bind: { record: 'BR-021' } }],
    });
    const again = await call('render_view', spec);
    expect(again).toMatchObject({ isError: true, body: { error: { code: 'ALREADY_COMPOSED' } } });
    expect(views()).toHaveLength(1);
  });

  it('a fallback may be repaired once', async () => {
    const bad = await call('render_view', {
      version: '1',
      path: 'chat',
      why: 'About a process.',
      components: [{ id: 'p', type: 'RecordCard', bind: { record: 'BR-999' } }],
    });
    expect(bad.body).toMatchObject({ fallback: true, dropped: ['0:id_not_found'] });
    const fixed = await call('render_view', {
      version: '1',
      path: 'chat',
      why: 'About a process.',
      components: [{ id: 'p', type: 'RecordCard', bind: { record: 'BR-021' } }],
    });
    expect(fixed.body).toMatchObject({ fallback: false, shown: ['p'] });
    expect(views()).toEqual([expect.objectContaining({ turn: 1, fallback: 0 })]);
  });

  it('a command is stored as a proposal, never run', async () => {
    const { body } = await call('propose_command', {
      command: 'scan.stop',
      args: { scan: '01a110d5' },
      reason: 'You asked to stop it.',
    });
    expect(body).toMatchObject({
      state: 'proposed',
      message: 'proposed, waiting for the person to confirm',
    });
    const run = raw().prepare(`SELECT status FROM runs WHERE id = ?`).get(RUN) as {
      status: string;
    };
    expect(run.status).toBe('running');
    const bad = await call('propose_command', {
      command: 'portal.delete',
      args: {},
      reason: 'Clean up.',
    });
    expect(bad).toMatchObject({ isError: true, body: { error: { code: 'UNKNOWN_COMMAND' } } });
    const refused = await call('propose_command', {
      command: 'scan.resume',
      args: { scan: '01a110d5' },
      reason: 'Go on.',
    });
    expect(refused).toMatchObject({ isError: true, body: { error: { code: 'PRECONDITION' } } });
  });

  it('refuses a proposal on an environment where commands are off (D-6, R-94 (8))', async () => {
    await client.close();
    const server = createChatMcpServer({
      raw: opened.raw,
      paths: { repoRoot: repo },
      conversationId: CONV,
      workbench: { phase: 1, environment: 'production' },
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    const off = await call('propose_command', {
      command: 'scan.stop',
      args: { scan: '01a110d5' },
      reason: 'You asked to stop it.',
    });
    expect(off).toMatchObject({ isError: true, body: { error: { code: 'PAUSED' } } });
  });
});
