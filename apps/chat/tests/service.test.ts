import { afterEach, describe, expect, it } from 'vitest';
import { REPLAY_BUFFER_SIZE, ChatError, type SequencedEvent } from '../src/service.js';
import { testService, until } from './helpers.js';

let current: ReturnType<typeof testService> | null = null;

function setup() {
  current = testService();
  return current;
}

afterEach(async () => {
  current?.service.close();
  await current?.opened.close();
  current = null;
});

async function newConversation(t: ReturnType<typeof setup>) {
  return (await t.service.createConversation({})).conversation.id;
}

function collect(t: ReturnType<typeof setup>, id: string, last: number | null = null) {
  const seen: SequencedEvent[] = [];
  const stop = t.service.subscribe(id, last, (e) => seen.push(e));
  return { seen, stop, types: () => seen.map((e) => e.event.type) };
}

describe('ChatService', () => {
  it('persists the user message and one assistant message, and streams events in order', async () => {
    const t = setup();
    const id = await newConversation(t);
    const { seen, types } = collect(t, id);
    const { messageId } = await t.service.send(id, 'hello');
    await until(() => types().includes('idle'));

    expect(types()).toEqual(['message_chunk', 'message_chunk', 'plan', 'message_done', 'idle']);
    expect(seen.map((e) => e.id)).toEqual([1, 2, 3, 4, 5]);
    const stored = await t.store.read(id);
    expect(stored?.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'hello'],
      ['assistant', 'Hi, I can scan a portal.'],
    ]);
    expect(stored?.messages[0]?.id).toBe(messageId);
    expect(stored?.conversation.acp_session_id).toBe('fake-session-1');
  });

  it('rejects a second send while a turn runs, then accepts one after it', async () => {
    const t = setup();
    const id = await newConversation(t);
    await t.service.send(id, 'hang');
    await expect(t.service.send(id, 'hello')).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('still answering') as unknown,
    });
    await until(() => t.log.prompts.includes('hang'));
    await t.service.cancel(id);
    await until(() => !t.service.isBusy(id));
    await expect(t.service.send(id, 'hello')).resolves.toBeDefined();
  });

  it('answers unknown conversations with 404', async () => {
    const t = setup();
    const error = await t.service.send('nope', 'hello').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ChatError);
    expect(error).toMatchObject({ status: 404 });
  });

  it('replays buffered events after Last-Event-ID and nothing without it', async () => {
    const t = setup();
    const id = await newConversation(t);
    const first = collect(t, id);
    await t.service.send(id, 'hello');
    await until(() => first.types().includes('idle'));

    expect(collect(t, id).seen).toEqual([]);
    const replay = collect(t, id, 3);
    expect(replay.seen.map((e) => e.id)).toEqual([4, 5]);
  });

  it('keeps only the last events in the buffer', () => {
    expect(REPLAY_BUFFER_SIZE).toBe(500);
  });

  it('persists refusals as system messages', async () => {
    const t = (current = testService(() => ({ allow: false, reason: 'not allowed here' })));
    const id = await newConversation(t);
    const { types } = collect(t, id);
    await t.service.send(id, 'bash');
    await until(() => types().includes('idle'));
    const refused = (await t.store.listMessages(id)).find((m) => m.role === 'system');
    expect(refused?.tool_name).toBe('Bash');
    expect(refused?.content).toContain('not allowed here');
  });

  it('keeps a credential request in the history; other browser actions leave no row', async () => {
    const t = setup();
    const id = await newConversation(t);
    t.service.inject(id, [
      { type: 'ui_action', action: 'open', path: '/app/portals/liveinsurer/screens' },
      {
        type: 'ui_action',
        action: 'credential',
        portal: 'liveinsurer',
        environment: 'sandbox',
        persona: 'client',
        ref: 'LIVEINSURER_PASSWORD',
        reason: null,
      },
    ]);
    await t.service.drain(id);
    const rows = (await t.store.listMessages(id)).filter((m) => m.role === 'system');
    expect(rows.map((m) => [m.tool_name, m.content])).toContainEqual([
      'request_credential',
      'Credential needed: LIVEINSURER_PASSWORD · liveinsurer · sandbox · client.',
    ]);
    expect(rows.some((m) => m.content.includes('/screens'))).toBe(false);
  });

  it('survives an agent crash: error event with ref, then a new session on the next send', async () => {
    const t = setup();
    const id = await newConversation(t);
    const { types, seen } = collect(t, id);
    await t.service.send(id, 'crash');
    await until(() => !t.service.isBusy(id));
    await t.service.drain(id);
    const error = seen.find((e) => e.event.type === 'error')?.event;
    expect(error).toMatchObject({ type: 'error', ref: expect.stringMatching(/^ERR-/) as unknown });
    expect(t.service.agentStatus()).toBe('down');
    const messages = await t.store.listMessages(id);
    expect(messages.some((m) => m.role === 'system' && m.error_ref !== null)).toBe(true);

    await t.service.send(id, 'hello');
    await until(() => types().filter((x) => x === 'message_done').length >= 1);
    await t.service.drain(id);
    expect(types()).toContain('notice');
    expect(t.log.sessions).toHaveLength(2);
    expect(t.service.agentStatus()).toBe('up');
    expect((await t.store.getConversation(id))?.acp_session_id).toBe('fake-session-2');
  });

  it('a restarted session gets the last messages and the missed error (F-18, F-19, T051)', async () => {
    const t = setup();
    const id = await newConversation(t);
    await t.service.send(id, 'hello');
    await until(() => !t.service.isBusy(id));
    expect(t.log.rawPrompts[0]).toBe('hello'); // brand-new conversation: nothing to hand over
    await t.service.send(id, 'crash');
    await until(() => !t.service.isBusy(id));
    await t.service.send(id, 'hello');
    await until(() => !t.service.isBusy(id));
    const sent = t.log.rawPrompts.at(-1)!;
    expect(sent).toContain('Your earlier session of this conversation was lost');
    expect(sent).toContain('- BA: hello');
    expect(sent).toContain('- You: Hi, I can scan a portal.');
    expect(sent).toContain('Shown to the BA since your last reply:\n- The assistant stopped');
    expect(sent.endsWith("BA's message:\nhello")).toBe(true);
  });

  it('[reset assistant] starts a fresh session without the earlier messages (T051)', async () => {
    const t = setup();
    const id = (await t.service.createConversation({ portal: 'reference-insurer' })).conversation
      .id;
    await t.service.send(id, 'hello');
    await until(() => !t.service.isBusy(id));
    await t.service.reset(id);
    expect((await t.store.getConversation(id))?.acp_session_id).toBeNull();
    await t.service.send(id, 'hello');
    await until(() => !t.service.isBusy(id));
    expect(t.log.sessions).toHaveLength(2);
    const sent = t.log.rawPrompts.at(-1)!;
    expect(sent).toContain('This is a new session of this conversation.');
    expect(sent).toContain('Portal: reference-insurer.');
    expect(sent).not.toContain('- BA: hello');
    expect(sent).toContain('- Assistant context reset.');
    const notices = (await t.store.listMessages(id)).filter((m) => m.role === 'system');
    expect(notices.map((m) => m.content)).not.toContainEqual(
      expect.stringContaining('restarted in a new session'),
    );
  });

  it('refuses a reset while the assistant answers, and for unknown conversations', async () => {
    const t = setup();
    const id = await newConversation(t);
    await t.service.send(id, 'hang');
    await until(() => t.log.prompts.includes('hang'));
    await expect(t.service.reset(id)).rejects.toMatchObject({ status: 409 });
    await t.service.cancel(id);
    await until(() => !t.service.isBusy(id));
    await expect(t.service.reset('ghost')).rejects.toBeInstanceOf(ChatError);
  });

  it('reports idle before any agent started', () => {
    expect(setup().service.agentStatus()).toBe('idle');
  });
});
