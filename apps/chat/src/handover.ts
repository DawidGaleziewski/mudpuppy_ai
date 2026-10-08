// Handover (R-30 T051, F-18, F-19): what the chat service tells the assistant before the BA's
// message. The assistant only sees its own ACP session, so it misses what happened outside it:
// notices posted by the service (a stopped scan, a failed step) and, in a new session, the
// conversation itself. The block is built from the store; it is never shown in the chat.

import type { ChatConversation, ChatMessage, WorkflowStep } from '@pathfinder/chat-model';

/**
 * How the assistant's session relates to the conversation:
 * - `continuing`: same session as the last turn; only missed notices are passed.
 * - `fresh`: a first session, or one the BA reset; portal and steps, no earlier messages.
 * - `restart`: the session was lost (crash, service restart); also the last messages.
 */
export type SessionKind = 'continuing' | 'fresh' | 'restart';

export interface HandoverInput {
  kind: SessionKind;
  conversation: ChatConversation;
  steps: readonly WorkflowStep[];
  /** History before the message being sent, oldest first. */
  messages: readonly ChatMessage[];
}

/** Earlier messages passed after a restart, and the longest text kept from each. */
export const RECENT_MESSAGES = 12;
export const MAX_MESSAGE_CHARS = 600;
const MAX_NOTICES = 10;

const clip = (text: string): string =>
  text.length > MAX_MESSAGE_CHARS ? `${text.slice(0, MAX_MESSAGE_CHARS)}…` : text;

/** Service notices posted since the assistant last wrote: it has not seen them. */
function missedNotices(messages: readonly ChatMessage[]): ChatMessage[] {
  let last = -1;
  messages.forEach((m, i) => {
    if (m.role === 'assistant') last = i;
  });
  return messages
    .slice(last + 1)
    .filter((m) => m.role === 'system')
    .slice(-MAX_NOTICES);
}

/** The context block, or null when there is nothing to pass. */
export function handover(input: HandoverInput): string | null {
  const lines: string[] = [];
  // Newest row per step; a conversation can hold a step's portal before its own is set (F-22).
  const latest = new Map<string, WorkflowStep>();
  for (const s of [...input.steps].sort((a, b) => a.updated_at.localeCompare(b.updated_at)))
    latest.set(s.step, s);
  const steps = [...latest.values()];
  const portal = input.conversation.portal_id ?? steps.at(-1)?.portal_id ?? null;
  // A brand-new conversation has nothing to hand over yet.
  const blank = input.kind === 'fresh' && portal === null && steps.length === 0;
  if (input.kind !== 'continuing' && !blank) {
    lines.push(
      input.kind === 'restart'
        ? 'Your earlier session of this conversation was lost; this is a new one.'
        : 'This is a new session of this conversation.',
    );
    lines.push(portal === null ? 'Portal: not chosen yet.' : `Portal: ${portal}.`);
    if (steps.length > 0)
      lines.push(
        `Steps: ${steps
          .map((s) => `${s.step} ${s.status}${s.run_id === null ? '' : ` (run ${s.run_id})`}`)
          .join('; ')}. Call workflow_state for details.`,
      );
  }
  if (input.kind === 'restart') {
    const recent = input.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-RECENT_MESSAGES);
    if (recent.length > 0) {
      lines.push('Last messages:');
      for (const m of recent)
        lines.push(`- ${m.role === 'user' ? 'BA' : 'You'}: ${clip(m.content)}`);
    }
  }
  const notices = missedNotices(input.messages);
  if (notices.length > 0) {
    lines.push('Shown to the BA since your last reply:');
    for (const m of notices) lines.push(`- ${clip(m.content)}`);
  }
  if (lines.length === 0) return null;
  return `[Context from the chat service, not typed by the BA]\n${lines.join('\n')}\n[End of context]`;
}

/** The prompt sent to the assistant: the handover block, if any, then the BA's message. */
export function promptWithHandover(block: string | null, text: string): string {
  return block === null ? text : `${block}\n\nBA's message:\n${text}`;
}
