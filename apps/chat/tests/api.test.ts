import { mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi, listenLocal } from '../src/api.js';
import { findError, logError } from '../src/error-log.js';
import { testService, until } from './helpers.js';

interface Frame {
  id: string | null;
  event: string | null;
  data: unknown;
}

/** Read SSE frames from a response until `done` says so; then abort the request. */
async function readFrames(
  res: Response,
  abort: AbortController,
  done: (frames: Frame[]) => boolean,
): Promise<Frame[]> {
  const frames: Frame[] = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (!done(frames)) {
    const { value, done: ended } = await reader.read();
    if (ended) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      if (block.startsWith(':')) continue;
      const frame: Frame = { id: null, event: null, data: null };
      for (const line of block.split('\n')) {
        if (line.startsWith('id: ')) frame.id = line.slice(4);
        else if (line.startsWith('event: ')) frame.event = line.slice(7);
        else if (line.startsWith('data: ')) frame.data = JSON.parse(line.slice(6));
      }
      frames.push(frame);
    }
  }
  abort.abort();
  return frames;
}

describe('chat HTTP API', () => {
  let t: ReturnType<typeof testService>;
  let server: Server;
  let base: string;
  let logsDir: string;

  beforeEach(async () => {
    t = testService();
    logsDir = await mkdtemp(join(tmpdir(), 'chat-api-'));
    server = createApi({
      service: t.service,
      logError: (input) => logError(input, { logsDir }),
      findError: (ref) => findError(ref, { logsDir }),
      version: '1.2.3',
      heartbeatMs: 30,
    });
    const port = await listenLocal(server, 0);
    base = `http://127.0.0.1:${String(port)}`;
  });

  afterEach(async () => {
    t.service.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await t.opened.close();
    await rm(logsDir, { recursive: true, force: true });
  });

  const post = (path: string, body: unknown) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  async function create(): Promise<string> {
    const res = await post('/conversations', { portal: 'liveinsurer', goal: 'map claims' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; steps: unknown[] };
    expect(body.steps).toEqual([]);
    return body.id;
  }

  it('is bound to loopback', () => {
    const address = server.address();
    expect(typeof address === 'object' && address?.address).toBe('127.0.0.1');
  });

  it('reports health: idle, then up after a turn', async () => {
    let res = await fetch(`${base}/healthz`);
    expect(await res.json()).toEqual({ ok: true, agent: 'idle', version: '1.2.3' });
    const id = await create();
    expect((await post(`/conversations/${id}/messages`, { text: 'hello' })).status).toBe(202);
    await until(() => t.service.agentStatus() === 'up');
    res = await fetch(`${base}/healthz`);
    expect(((await res.json()) as { agent: string }).agent).toBe('up');
  });

  it('streams a turn over SSE in order and persists the assistant message', async () => {
    const id = await create();
    const abort = new AbortController();
    const events = await fetch(`${base}/conversations/${id}/events`, { signal: abort.signal });
    expect(events.headers.get('content-type')).toContain('text/event-stream');
    const send = await post(`/conversations/${id}/messages`, { text: 'hello' });
    expect(send.status).toBe(202);
    expect(((await send.json()) as { messageId: string }).messageId).toBeTruthy();

    const frames = await readFrames(events, abort, (f) => f.some((x) => x.event === 'idle'));
    expect(frames.map((f) => f.event)).toEqual([
      'status',
      'message_chunk',
      'message_chunk',
      'plan',
      'message_done',
      'idle',
    ]);
    // T048: connection state first, without an id, so Last-Event-ID replay is unchanged
    expect(frames[0]).toEqual({ id: null, event: 'status', data: { busy: false } });
    expect(frames.slice(1).map((f) => f.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(frames[1]?.data).toEqual({ type: 'message_chunk', text: 'Hi, ' });

    const messages = await t.store.listMessages(id);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[1]?.content).toBe('Hi, I can scan a portal.');
  });

  it('replays after Last-Event-ID and sends heartbeats', async () => {
    const id = await create();
    await post(`/conversations/${id}/messages`, { text: 'hello' });
    await until(() => !t.service.isBusy(id));

    const abort = new AbortController();
    const fresh = await fetch(`${base}/conversations/${id}/events`, { signal: abort.signal });
    const reader = fresh.body!.getReader();
    let head = '';
    while (!head.includes(': ping')) head += new TextDecoder().decode((await reader.read()).value);
    // nothing replayed without Last-Event-ID: only the connection status (T048), then heartbeats
    expect(head.match(/^event: .*$/gm)).toEqual(['event: status']);
    expect(head).toContain('data: {"busy":false}');
    abort.abort();

    const abort2 = new AbortController();
    const replay = await fetch(`${base}/conversations/${id}/events`, {
      headers: { 'last-event-id': '3' },
      signal: abort2.signal,
    });
    const frames = await readFrames(replay, abort2, (f) => f.length >= 3);
    expect(frames.map((f) => f.event)).toEqual(['status', 'message_done', 'idle']);
    expect(frames.map((f) => f.id)).toEqual([null, '4', '5']);
  });

  it('answers a concurrent send with 409 and a plain message', async () => {
    const id = await create();
    expect((await post(`/conversations/${id}/messages`, { text: 'hang' })).status).toBe(202);
    const second = await post(`/conversations/${id}/messages`, { text: 'hello' });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { ref: string; message: string };
    expect(body.ref).toMatch(/^ERR-/);
    expect(body.message).toContain('still answering');
    await until(() => t.log.prompts.includes('hang'));
    // T048: a page opened mid-turn learns at once that the assistant is working
    const abort = new AbortController();
    const late = await fetch(`${base}/conversations/${id}/events`, { signal: abort.signal });
    const [status] = await readFrames(late, abort, (f) => f.length >= 1);
    expect(status).toEqual({ id: null, event: 'status', data: { busy: true } });
    await t.service.cancel(id);
  });

  it('rejects bad input with 400 and unknown things with 404', async () => {
    const id = await create();
    for (const bad of [{}, { text: '' }, { text: 5 }]) {
      const res = await post(`/conversations/${id}/messages`, bad);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { ref: string }).ref).toMatch(/^ERR-/);
    }
    expect((await post('/conversations', '{not json')).status).toBe(400);
    expect((await post('/conversations', { portal: '' })).status).toBe(400);
    expect((await post('/conversations/nope/messages', { text: 'hi' })).status).toBe(404);
    expect((await fetch(`${base}/conversations/nope/events`)).status).toBe(404);
    expect((await fetch(`${base}/nothing`)).status).toBe(404);
  });

  it('turns an agent crash into an error event with a ref, then recovers on the next send', async () => {
    const id = await create();
    const abort = new AbortController();
    const events = await fetch(`${base}/conversations/${id}/events`, { signal: abort.signal });
    await post(`/conversations/${id}/messages`, { text: 'crash' });
    const frames = await readFrames(events, abort, (f) => f.some((x) => x.event === 'error'));
    const error = frames.find((f) => f.event === 'error')?.data as { ref: string; message: string };
    expect(error.ref).toMatch(/^ERR-/);

    await until(() => !t.service.isBusy(id));

    expect((await post(`/conversations/${id}/messages`, { text: 'hello' })).status).toBe(202);
    await until(() => !t.service.isBusy(id));
    const messages = await t.store.listMessages(id);
    expect(messages.some((m) => m.role === 'assistant')).toBe(true);
    expect(messages.some((m) => m.role === 'system' && m.content.includes('restarted'))).toBe(true);
  });

  it('looks up errors by reference and 404s unknown ones', async () => {
    const { ref } = await logError({ where: 'test', message: 'boom' }, { logsDir });
    const found = await fetch(`${base}/errors/${ref}`);
    expect(found.status).toBe(200);
    expect(((await found.json()) as { message: string }).message).toBe('boom');
    expect((await fetch(`${base}/errors/ERR-00000000000000000000000000`)).status).toBe(404);
    expect((await fetch(`${base}/errors/garbage`)).status).toBe(404);
  });
});
