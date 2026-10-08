import { z } from 'zod';
import { Id, Timestamp } from '@pathfinder/core';

export const ChatConversationStatus = z.enum(['active', 'closed']);
export type ChatConversationStatus = z.infer<typeof ChatConversationStatus>;

/**
 * One BA chat conversation (`chat_conversations`, 0008, spec 010 data-model.md). Written only by
 * `@pathfinder/chat`. `portal_id` is NULL until the BA chooses a portal. `persona_draft` is a JSON
 * object (stored as TEXT) and never holds secrets.
 */
export const ChatConversation = z.object({
  id: Id,
  portal_id: z.string().min(1).nullable(),
  goal: z.string(),
  acp_session_id: z.string().nullable(),
  persona_draft: z.record(z.string(), z.unknown()),
  status: ChatConversationStatus,
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type ChatConversation = z.infer<typeof ChatConversation>;

export const ChatMessageRole = z.enum(['user', 'assistant', 'system', 'tool']);
export type ChatMessageRole = z.infer<typeof ChatMessageRole>;

/** One message of a conversation (`chat_messages`); `seq` orders them. Credentials never land here. */
export const ChatMessage = z.object({
  id: Id,
  conversation_id: Id,
  seq: z.number().int().min(0),
  role: ChatMessageRole,
  content: z.string(),
  tool_name: z.string().nullable(),
  /** Reference into `data/logs/chat/*.jsonl`. */
  error_ref: z.string().nullable(),
  created_at: Timestamp,
});
export type ChatMessage = z.infer<typeof ChatMessage>;
