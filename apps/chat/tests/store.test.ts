import type { OpenedDb } from '@pathfinder/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatStore } from '../src/store.js';
import { recordStep } from '../src/steps.js';
import { memoryStore } from './helpers.js';

describe('ChatStore', () => {
  let opened: OpenedDb;
  let store: ChatStore;
  beforeEach(() => {
    ({ opened, store } = memoryStore());
  });
  afterEach(async () => {
    await opened.close();
  });

  it('creates a conversation and resumes the active one of the same portal', async () => {
    const a = await store.createOrResume({ portal: 'liveinsurer', goal: 'map claims' });
    const b = await store.createOrResume({ portal: 'liveinsurer' });
    expect(b.id).toBe(a.id);
    const c = await store.createOrResume({});
    expect(c.id).not.toBe(a.id);
    expect(c.portal_id).toBeNull();
    expect((await store.getConversation(a.id))?.goal).toBe('map claims');
    expect(await store.getConversation('nope')).toBeNull();
    // spec 011: [new conversation] for a chosen portal always starts a new one
    const d = await store.createOrResume({ portal: 'liveinsurer', fresh: true });
    expect(d.id).not.toBe(a.id);
    expect(d.portal_id).toBe('liveinsurer');
    expect((await store.createOrResume({ portal: 'liveinsurer' })).id).toBe(d.id); // newest resumes
  });

  it('appends messages with increasing seq', async () => {
    const conv = await store.createOrResume({});
    const m0 = await store.appendMessage(conv.id, { role: 'user', content: 'hi' });
    const m1 = await store.appendMessage(conv.id, {
      role: 'system',
      content: 'x',
      errorRef: 'ERR-1',
    });
    expect([m0.seq, m1.seq]).toEqual([0, 1]);
    const list = await store.listMessages(conv.id);
    expect(list.map((m) => m.content)).toEqual(['hi', 'x']);
    expect(list[1]?.error_ref).toBe('ERR-1');
  });

  it('gives concurrent appends distinct seq values', async () => {
    const conv = await store.createOrResume({});
    await Promise.all(
      [1, 2, 3, 4].map((n) => store.appendMessage(conv.id, { role: 'user', content: String(n) })),
    );
    const seqs = (await store.listMessages(conv.id)).map((m) => m.seq);
    expect(seqs).toEqual([0, 1, 2, 3]);
  });

  it('stores the acp session id', async () => {
    const conv = await store.createOrResume({});
    await store.setAcpSession(conv.id, 'sess-1');
    expect((await store.getConversation(conv.id))?.acp_session_id).toBe('sess-1');
  });

  it('keeps one step row per conversation, portal and step (recordStep is the only writer)', async () => {
    const conv = await store.createOrResume({ portal: 'liveinsurer' });
    const base = { conversationId: conv.id, portalId: 'liveinsurer', step: 'scan' as const };
    const s1 = recordStep(opened.raw, {
      ...base,
      status: 'pending',
      now: new Date('2026-10-06T01:00:00Z'),
    });
    const s2 = recordStep(opened.raw, {
      ...base,
      status: 'in_progress',
      now: new Date('2026-10-06T01:05:00Z'),
    });
    const s3 = recordStep(opened.raw, { ...base, status: 'failed', errorRef: 'ERR-2' });
    expect(s2.id).toBe(s1.id);
    // started_at stays the request time: the recorder matches runs that started after it
    expect(s2.started_at).toBe('2026-10-06T01:00:00.000Z');
    expect(s3.finished_at).not.toBeNull();
    expect(s3.started_at).toBe(s2.started_at);
    const retry = recordStep(opened.raw, {
      ...base,
      status: 'pending',
      now: new Date('2026-10-06T02:00:00Z'),
    });
    expect(retry.started_at).toBe('2026-10-06T02:00:00.000Z');
    expect(retry.error_ref).toBeNull();
    recordStep(opened.raw, { ...base, status: 'failed', errorRef: 'ERR-2' });
    const all = await store.read(conv.id);
    expect(all?.steps).toHaveLength(1);
    expect(all?.steps[0]?.error_ref).toBe('ERR-2');
    expect(await store.read('nope')).toBeNull();
  });
});
