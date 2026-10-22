// T051 (F-18, F-19): the context block the chat service puts before the BA's message.

import type { ChatConversation, ChatMessage, WorkflowStep } from '@mudpuppy/chat-model';
import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_CHARS, handover, promptWithHandover } from '../src/handover.js';

const T = '2026-10-06T10:00:00.000Z';
const conversation: ChatConversation = {
  id: 'c1',
  portal_id: null,
  goal: '',
  acp_session_id: null,
  persona_draft: {},
  status: 'active',
  created_at: T,
  updated_at: T,
  kind: 'chat',
};

let seq = 0;
const msg = (role: ChatMessage['role'], content: string): ChatMessage => ({
  id: `m${String(seq)}`,
  conversation_id: 'c1',
  seq: seq++,
  role,
  content,
  tool_name: null,
  error_ref: null,
  created_at: T,
});

const step = (name: WorkflowStep['step'], status: WorkflowStep['status'], updated: string) =>
  ({
    id: `s-${name}-${updated}`,
    conversation_id: 'c1',
    portal_id: 'reference-insurer',
    step: name,
    status,
    run_id: status === 'failed' ? 'run-9' : null,
    session_id: null,
    error_ref: null,
    started_at: null,
    finished_at: null,
    updated_at: updated,
  }) satisfies WorkflowStep;

describe('handover', () => {
  it('passes nothing in a continuing session with no new notices', () => {
    const messages = [msg('user', 'hi'), msg('assistant', 'hello'), msg('system', 'old notice')];
    messages.push(msg('assistant', 'later reply'));
    expect(handover({ kind: 'continuing', conversation, steps: [], messages })).toBeNull();
  });

  it('passes only the notices posted since the last reply (F-19)', () => {
    const messages = [
      msg('assistant', 'Started the scan.'),
      msg('system', 'The scan of reference-insurer was stopped (run r1).'),
    ];
    const block = handover({ kind: 'continuing', conversation, steps: [], messages })!;
    expect(block).toContain('- The scan of reference-insurer was stopped (run r1).');
    expect(block).not.toContain('Portal:');
    expect(promptWithHandover(block, 'resume it')).toMatch(
      /\[End of context\]\n\nBA's message:\nresume it$/,
    );
  });

  it('takes the newest row per step and the steps’ portal when the conversation has none', () => {
    const steps = [
      step('scan', 'in_progress', '2026-10-06T10:00:00.000Z'),
      step('scan', 'failed', '2026-10-06T11:00:00.000Z'),
    ];
    const block = handover({ kind: 'fresh', conversation, steps, messages: [] })!;
    expect(block).toContain('Portal: reference-insurer.');
    expect(block).toContain('Steps: scan failed (run run-9).');
    expect(block).not.toContain('in_progress');
  });

  it('clips long messages after a restart', () => {
    const block = handover({
      kind: 'restart',
      conversation,
      steps: [],
      messages: [msg('user', 'x'.repeat(MAX_MESSAGE_CHARS + 50))],
    })!;
    expect(block).toContain(`- BA: ${'x'.repeat(MAX_MESSAGE_CHARS)}…`);
  });
});
