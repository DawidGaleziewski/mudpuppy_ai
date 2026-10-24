// Writes and reads of the chat tables (R-30 T014). Every row passes the core Zod schemas on the
// way in and out. Conversations and messages are written only here, workflow steps only in
// `steps.ts`; the dashboard reads the same tables read-only.

import { newId, nowIso } from '@mudpuppy/core';
import {
  ChatConversation,
  ChatMessage,
  WorkflowStep,
  type ChatMessageRole,
} from '@mudpuppy/chat-model';
import { type MudPuppyDb } from '@mudpuppy/store';

export interface NewConversation {
  portal?: string | null;
  goal?: string;
  /** Always a new conversation, even when the portal has an active one ([new conversation]). */
  fresh?: boolean;
}

export interface NewMessage {
  role: ChatMessageRole;
  content: string;
  toolName?: string | null;
  errorRef?: string | null;
}

type ConversationRow = Omit<ChatConversation, 'persona_draft'> & { persona_draft: string };

function parseConversation(row: ConversationRow): ChatConversation {
  const draft: unknown = JSON.parse(row.persona_draft);
  return ChatConversation.parse({ ...row, persona_draft: draft });
}

export class ChatStore {
  constructor(private readonly db: MudPuppyDb) {}

  /** Create a conversation, or resume the newest active one of the same portal. */
  async createOrResume(input: NewConversation = {}): Promise<ChatConversation> {
    const portal = input.portal ?? null;
    if (portal !== null && input.fresh !== true) {
      const existing = await this.db
        .selectFrom('chat_conversations')
        .selectAll()
        .where('portal_id', '=', portal)
        .where('status', '=', 'active')
        .orderBy('id', 'desc')
        .executeTakeFirst();
      if (existing !== undefined) return parseConversation(existing);
    }
    const now = nowIso();
    const row = ChatConversation.parse({
      id: newId(),
      portal_id: portal,
      goal: input.goal ?? '',
      acp_session_id: null,
      persona_draft: {},
      status: 'active',
      created_at: now,
      updated_at: now,
      kind: 'chat',
    });
    await this.db
      .insertInto('chat_conversations')
      .values({ ...row, persona_draft: JSON.stringify(row.persona_draft) })
      .execute();
    return row;
  }

  async getConversation(id: string): Promise<ChatConversation | null> {
    const row = await this.db
      .selectFrom('chat_conversations')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : parseConversation(row);
  }

  /** Null after a reset (T051): the next session starts fresh, not as a lost one. */
  async setAcpSession(id: string, acpSessionId: string | null): Promise<void> {
    await this.db
      .updateTable('chat_conversations')
      .set({ acp_session_id: acpSessionId, updated_at: nowIso() })
      .where('id', '=', id)
      .execute();
  }

  /** Append a message with the next `seq` (0-based) of its conversation. */
  async appendMessage(conversationId: string, msg: NewMessage): Promise<ChatMessage> {
    return this.db.transaction().execute(async (trx) => {
      const last = await trx
        .selectFrom('chat_messages')
        .select('seq')
        .where('conversation_id', '=', conversationId)
        .orderBy('seq', 'desc')
        .limit(1)
        .executeTakeFirst();
      const row = ChatMessage.parse({
        id: newId(),
        conversation_id: conversationId,
        seq: last === undefined ? 0 : last.seq + 1,
        role: msg.role,
        content: msg.content,
        tool_name: msg.toolName ?? null,
        error_ref: msg.errorRef ?? null,
        created_at: nowIso(),
      });
      await trx.insertInto('chat_messages').values(row).execute();
      return row;
    });
  }

  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    const rows = await this.db
      .selectFrom('chat_messages')
      .selectAll()
      .where('conversation_id', '=', conversationId)
      .orderBy('seq', 'asc')
      .execute();
    return rows.map((r) => ChatMessage.parse(r));
  }

  // Steps are written only by `steps.ts` `recordStep` (one writer, portal-aware; findings F-08).

  async listSteps(conversationId: string): Promise<WorkflowStep[]> {
    const rows = await this.db
      .selectFrom('workflow_steps')
      .selectAll()
      .where('conversation_id', '=', conversationId)
      .orderBy('id', 'asc')
      .execute();
    return rows.map((r) => WorkflowStep.parse(r));
  }

  async read(conversationId: string): Promise<{
    conversation: ChatConversation;
    messages: ChatMessage[];
    steps: WorkflowStep[];
  } | null> {
    const conversation = await this.getConversation(conversationId);
    if (conversation === null) return null;
    return {
      conversation,
      messages: await this.listMessages(conversationId),
      steps: await this.listSteps(conversationId),
    };
  }
}
