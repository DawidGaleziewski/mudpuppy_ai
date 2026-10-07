import type { Server } from 'node:http';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi, listenLocal } from '../src/api.js';
import type { ChatEvent } from '../src/events.js';
import { setProcessScope } from '../src/scope.js';
import { testService } from './helpers.js';

const repo = resolve(import.meta.dirname, '../../..');
const P = 'reference-insurer';
const T = '2026-10-06T00:00:00.000Z';

describe('POST /conversations/{id}/scope (T027)', () => {
  let t: ReturnType<typeof testService>;
  let server: Server;
  let base: string;
  let id: string;

  beforeEach(async () => {
    t = testService();
    t.opened.raw
      .prepare(
        `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, status, started_at)
         VALUES ('run-1', ?, 'guest', 'map', 'sandbox', '2026-10-06', '1366x768', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
      )
      .run(P, T);
    const state = t.opened.raw.prepare(
      `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence, stabilization, first_seen_run, created_at)
       VALUES (?, ?, ?, 'c', ?, 't', 'ev', 'observed', 'settled', 'run-1', ?)`,
    );
    state.run('s-a', P, 'fa', '/a', T);
    state.run('s-b', P, 'fb', '/b', T);
    server = createApi({
      service: t.service,
      logError: () => Promise.resolve({ ref: 'ERR-S', logged: true }),
      findError: () => Promise.resolve(null),
      version: 'test',
      scope: (conversationId, body) => setProcessScope(t.opened.raw, repo, conversationId, body),
    });
    base = `http://127.0.0.1:${String(await listenLocal(server, 0))}`;
    id = (await t.service.createConversation({ portal: P })).conversation.id;
  });
  afterEach(async () => {
    server.close();
    await t.opened.close();
  });

  const post = (body: unknown) =>
    fetch(`${base}/conversations/${id}/scope`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('saves the confirmed scope and tells the chat', async () => {
    const seen: ChatEvent[] = [];
    t.service.subscribe(id, null, (e) => seen.push(e.event));
    const res = await post({
      portal: P,
      process_name: 'Quote',
      persona: 'guest',
      start_state_id: 's-a',
      end_state_id: 's-b',
      comments: { 's-a': 'start here' },
    });
    expect(res.status).toBe(201);
    await t.service.drain(id);
    expect(seen[0]).toMatchObject({ type: 'notice' });
    expect((seen[0] as { text: string }).text).toContain('Process scope saved: "Quote"');
  });

  it('answers 400 with the problems for unknown states', async () => {
    const res = await post({
      portal: P,
      process_name: 'Quote',
      persona: 'guest',
      start_state_id: 's-a',
      end_state_id: 'ghost',
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toContain('state ghost');
  });
});
