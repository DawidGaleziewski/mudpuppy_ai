import { describe, expect, it } from 'vitest';
import {
  AcpChat,
  launchedInBackground,
  promptFailureMessage,
  type PermissionPolicy,
  type PermissionQuery,
} from '../src/acp-client.js';
import type { ErrorInput } from '../src/error-log.js';
import type { ChatEvent } from '../src/events.js';
import { fakeAgent } from './fake-agent.js';

function setup(
  policy: PermissionPolicy = () => ({ allow: true, reason: 'ok' }),
  timeoutMs?: number,
) {
  const { launch, log } = fakeAgent();
  const events: ChatEvent[] = [];
  const errors: ErrorInput[] = [];
  const queries: PermissionQuery[] = [];
  const chat = new AcpChat({
    launch,
    session: { cwd: '/tmp/pathfinder-chat-runtime', mcpServers: [] },
    policy: (q) => {
      queries.push(q);
      return policy(q);
    },
    onEvent: (e) => events.push(e),
    logError: (input) => {
      errors.push(input);
      return Promise.resolve({ ref: `ERR-TEST${String(errors.length)}`, logged: true });
    },
    conversationId: 'conv-1',
    ...(timeoutMs === undefined ? {} : { turnTimeoutMs: timeoutMs }),
  });
  return { chat, log, events, errors, queries };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
}

describe('AcpChat', () => {
  it('opens a session with the given request', async () => {
    const { chat, log } = setup();
    const id = await chat.start();
    expect(id).toBe('fake-session-1');
    expect(log.sessions[0]).toMatchObject({ cwd: '/tmp/pathfinder-chat-runtime' });
    chat.close();
  });

  it('streams message chunks, plan, then done and idle', async () => {
    const { chat, events } = setup();
    await chat.start();
    expect(await chat.prompt('hello')).toBe('end_turn');
    await settle();
    expect(events).toEqual([
      { type: 'message_chunk', text: 'Hi, ' },
      { type: 'message_chunk', text: 'I can scan a portal.' },
      { type: 'plan', entries: [{ content: 'Scan portal', status: 'pending' }] },
      { type: 'message_done', stopReason: 'end_turn' },
      { type: 'idle' },
    ]);
    chat.close();
  });

  it('starts a new paragraph when the assistant writes again after a tool call (F-19)', async () => {
    const { chat, events } = setup();
    await chat.start();
    await chat.prompt('text-tool-text');
    await settle();
    const text = events
      .filter((e): e is Extract<ChatEvent, { type: 'message_chunk' }> => e.type === 'message_chunk')
      .map((e) => e.text)
      .join('');
    expect(text).toBe('Resuming it.\n\nThe scan is running.');
    // the next turn starts without a leading break
    await chat.prompt('hello');
    await settle();
    expect(events.filter((e) => e.type === 'message_chunk').at(-2)).toEqual({
      type: 'message_chunk',
      text: 'Hi, ',
    });
    chat.close();
  });

  it('allows a tool the policy allows and reports start and finish', async () => {
    const { chat, events, log, queries } = setup();
    await chat.start();
    await chat.prompt('workflow');
    await settle();
    expect(queries[0]).toMatchObject({
      toolCallId: 't1',
      tool: 'mcp__pathfinder-chat__workflow_state',
      parentToolCallId: null,
    });
    expect(log.permissionOutcomes).toEqual(['mcp__pathfinder-chat__workflow_state:allow']);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'tool_finished', toolCallId: 't1', status: 'completed' }),
    );
    chat.close();
  });

  it('rejects what the policy refuses and says so in the chat', async () => {
    const { chat, events, log } = setup((q) =>
      q.tool === 'Bash' ? { allow: false, reason: 'harness change' } : { allow: true, reason: '' },
    );
    await chat.start();
    await chat.prompt('bash');
    await settle();
    expect(log.permissionOutcomes).toEqual(['Bash:reject']);
    expect(events).toContainEqual({
      type: 'refused',
      tool: 'Bash',
      title: 'rm -rf .claude',
      reason: 'harness change',
    });
    chat.close();
  });

  it('a throwing policy rejects instead of allowing', async () => {
    const { chat, log } = setup(() => {
      throw new Error('boom');
    });
    await chat.start();
    await chat.prompt('workflow');
    expect(log.permissionOutcomes).toEqual(['mcp__pathfinder-chat__workflow_state:reject']);
    chat.close();
  });

  it('tells the policy which subagent a nested call belongs to', async () => {
    const { chat, queries } = setup();
    await chat.start();
    await chat.prompt('subagent');
    expect(queries[0]).toMatchObject({
      toolCallId: 'c1',
      tool: 'mcp__pathfinder__navigate',
      parentToolCallId: 'a1',
      parentAgent: 'crawler',
    });
    chat.close();
  });

  it('reports an agent crash with an error reference', async () => {
    const { chat, events, errors } = setup();
    await chat.start();
    await chat.prompt('crash').catch(() => undefined);
    await settle();
    expect(chat.alive).toBe(false);
    expect(errors.some((e) => e.where.startsWith('acp-client'))).toBe(true);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'error', message: 'The assistant stopped unexpectedly.' }),
    );
    chat.close();
  });

  it('cancels a turn that runs past the timeout and reports it', async () => {
    const { chat, events, log } = setup(undefined, 50);
    await chat.start();
    expect(await chat.prompt('hang')).toBe('cancelled');
    expect(log.cancelled).toBe(1);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'error',
        message: 'The assistant took too long and was stopped.',
      }),
    );
    chat.close();
  });

  it('does not cancel a long turn that keeps reporting progress (F-20)', async () => {
    // 6 updates 20 ms apart = 120 ms of turn, well over the 50 ms limit on silence
    const { chat, log } = setup(undefined, 50);
    await chat.start();
    expect(await chat.prompt('busy')).toBe('end_turn');
    expect(log.cancelled).toBe(0);
    chat.close();
  });

  it('names a Claude usage limit and its reset time instead of a generic failure (F-21)', async () => {
    const { chat, events, errors } = setup();
    await chat.start();
    await expect(chat.prompt('limit')).rejects.toThrow('weekly limit');
    const message =
      'The assistant has used up its Claude usage limit. It resets 9pm (Europe/Warsaw); try again then.';
    expect(events).toContainEqual(expect.objectContaining({ type: 'error', message }));
    expect(errors[0]).toMatchObject({ where: 'acp-client prompt', message });
    expect(chat.alive).toBe(true);
    chat.close();
  });

  it('refuses a prompt before start, with an error reference', async () => {
    const { chat, events } = setup();
    await expect(chat.prompt('hello')).rejects.toThrow('session not started');
    expect(events[0]).toMatchObject({ type: 'error', ref: 'ERR-TEST1' });
  });
});

describe('promptFailureMessage (F-21)', () => {
  it('keeps the generic message for other failures', () => {
    expect(promptFailureMessage(new Error('Internal error: socket hang up'))).toBe(
      'The assistant stopped unexpectedly.',
    );
  });

  it('recognises a limit without a reset time', () => {
    expect(promptFailureMessage(new Error('429 rate_limit_error'))).toBe(
      'The assistant has used up its Claude usage limit. Try again later.',
    );
  });
});

describe('launchedInBackground (F-17)', () => {
  it('recognises the adapter’s async launch result, not a finished subagent', () => {
    const launched = {
      content: [
        {
          type: 'content',
          content: { type: 'text', text: 'Async agent launched successfully. agentId: x' },
        },
      ],
    };
    expect(launchedInBackground(launched)).toBe(true);
    expect(launchedInBackground({ rawOutput: 'Async agent launched successfully.' })).toBe(true);
    expect(
      launchedInBackground({
        content: [{ type: 'content', content: { type: 'text', text: 'Run 01a… completed.' } }],
      }),
    ).toBe(false);
    expect(launchedInBackground({})).toBe(false);
  });
});
