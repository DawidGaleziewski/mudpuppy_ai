// Spec 043 (contracts/workbench-http.md): the Workbench routes over HTTP with the fake agent. A
// turn reaches the assistant with its context; the Path switch is the person's; a card opened
// from a button gets a token, and Confirm runs it; feedback is one answer per view and person.

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi, listenLocal } from '../src/api.js';
import { logError } from '../src/error-log.js';
import type { ChatEvent } from '../src/events.js';
import { createWorkbenchService } from '../src/workbench-service.js';
import { Launches } from '../src/workbench-session.js';
import { telemetryLog } from '../src/workbench-telemetry.js';
import { testService, until } from './helpers.js';

const repo = join(import.meta.dirname, '..', '..', '..');
const P = 'reference-insurer';
const RUN = '01a110d5-0000-7000-8000-000000000001';

let t: ReturnType<typeof testService>;
let server: Server;
let base: string;
let logs: string;
const raw = () => t.opened.raw;

async function post(
  path: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(async () => {
  t = testService();
  logs = await mkdtemp(join(tmpdir(), 'wb-api-'));
  const workbench = createWorkbenchService({
    raw: raw(),
    service: t.service,
    paths: { repoRoot: repo },
    launches: new Launches(),
    telemetry: telemetryLog(join(logs, 'workbench')),
  });
  server = createApi({
    service: t.service,
    logError: (input) => logError(input, { logsDir: logs }),
    findError: () => Promise.resolve(null),
    version: '0.0.0',
    workbench,
  });
  base = `http://127.0.0.1:${String(await listenLocal(server, 0))}`;
  raw()
    .prepare(
      `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport,
         locale, browser, config_snapshot, status, started_at)
       VALUES (?, ?, 'guest', 'map', 'sandbox', 'd', 'v', 'l', 'b', '{}', 'running', '2026-10-06T10:00:00Z')`,
    )
    .run(RUN, P);
});

afterEach(async () => {
  t.service.close();
  server.close();
  await rm(logs, { recursive: true, force: true });
});

describe('Workbench routes', () => {
  it('a turn reaches the assistant with its context first', async () => {
    const { status, body } = await post('/workbench/conversations', { portal: P });
    expect(status).toBe(201);
    const c = String(body.conversation_id);
    const turn = await post(`/workbench/conversations/${c}/turns`, {
      text: 'Where is the crawler?',
      ctx: [{ kind: 'page', scan: RUN, route: '/kontakt' }],
      by: 'dawid',
    });
    expect(turn).toMatchObject({ status: 202, body: { turn: 1 } });
    await until(() => t.log.rawPrompts.length === 1);
    const prompt = t.log.rawPrompts[0] ?? '';
    expect(prompt).toContain('<workbench_context>');
    expect(prompt).toContain(`- ${RUN} · running`);
    expect(prompt).toContain('"route":"/kontakt"');
    expect(prompt.endsWith('Where is the crawler?')).toBe(true);
    const message = raw()
      .prepare(`SELECT content FROM chat_messages WHERE conversation_id = ? AND role = 'user'`)
      .get(c) as { content: string };
    expect(message.content).toBe('Where is the crawler?'); // the history keeps only what was typed
  });

  it('the person’s path switch is theirs; phase 2 paths are refused', async () => {
    const c = String((await post('/workbench/conversations', { portal: P })).body.conversation_id);
    expect(await post(`/workbench/conversations/${c}/path`, { path: 'mapping' })).toMatchObject({
      status: 200,
      body: { path: 'mapping', path_source: 'you' },
    });
    expect(
      (await post(`/workbench/conversations/${c}/path`, { path: 'troubleshoot' })).status,
    ).toBe(400);
    expect((await post('/workbench/conversations/nope/path', { path: 'chat' })).status).toBe(404);
  });

  it('a card from a button: token, Confirm, and the conversation hears each state', async () => {
    const c = String((await post('/workbench/conversations', { portal: P })).body.conversation_id);
    const heard: ChatEvent[] = [];
    t.service.subscribe(c, null, (e) => heard.push(e.event));
    const card = await post('/workbench/commands', {
      conversation_id: c,
      turn: 1,
      command: 'scan.stop',
      args: { scan: RUN },
    });
    expect(card.status).toBe(201);
    const id = String(card.body.id);
    expect(
      (
        await post(`/workbench/commands/${id}/confirm`, {
          token: 'test-token-not-real',
          by: 'dawid',
        })
      ).status,
    ).toBe(403);
    const token = String((await post(`/workbench/commands/${id}/token`, {})).body.token);
    expect(await post(`/workbench/commands/${id}/confirm`, { token, by: 'dawid' })).toMatchObject({
      status: 200,
      body: { state: 'done' },
    });
    await until(() => heard.filter((e) => e.type === 'wb_command').length === 2);
    expect(heard.filter((e) => e.type === 'wb_command')).toEqual([
      { type: 'wb_command', id, state: 'proposed' },
      { type: 'wb_command', id, state: 'done' },
    ]);
    expect((await post(`/workbench/commands/${id}/cancel`, {})).status).toBe(409);
  });

  it('feedback is one answer per view and person, changeable, logged without text', async () => {
    const c = String((await post('/workbench/conversations', { portal: P })).body.conversation_id);
    raw()
      .prepare(
        `INSERT INTO workbench_views (id, conversation_id, turn, path, why, spec_json, received_json, created_at)
         VALUES ('v1', ?, 1, 'chat', 'A short answer.', '{}', '{}', 'x')`,
      )
      .run(c);
    await post('/workbench/views/v1/feedback', { by: 'dawid', value: 'yes' });
    await post('/workbench/views/v1/feedback', {
      by: 'dawid',
      value: 'no',
      reasons: ['too_much', 'made_up'],
      text: 'Too many cards',
    });
    const rows = raw().prepare(`SELECT value, reasons_json, text FROM workbench_feedback`).all();
    expect(rows).toEqual([{ value: 'no', reasons_json: '["too_much"]', text: 'Too many cards' }]);
    await new Promise((r) => setTimeout(r, 50)); // the log is written in the background
    const day = new Date().toISOString().slice(0, 10);
    const lines = (await readFile(join(logs, 'workbench', `${day}.jsonl`), 'utf8'))
      .trim()
      .split('\n');
    expect(lines.map((l) => (JSON.parse(l) as { event: string }).event)).toEqual([
      'wb_view_feedback',
      'wb_view_feedback',
    ]);
    expect(lines.join('')).not.toContain('Too many cards');
  });

  it('usage counts the day’s turns against the cap', async () => {
    const res = await fetch(`${base}/workbench/usage`);
    expect(await res.json()).toEqual({ turns_today: 0, cap: 200 });
  });
});
