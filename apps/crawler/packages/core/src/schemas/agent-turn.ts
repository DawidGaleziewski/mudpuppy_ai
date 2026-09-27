import { z } from 'zod';
import { Id, Timestamp } from './common.js';

export const AgentTurnRole = z.enum(['assistant', 'user']);
export type AgentTurnRole = z.infer<typeof AgentTurnRole>;

export const AgentTurnKind = z.enum(['text', 'thinking', 'tool_use', 'tool_result']);
export type AgentTurnKind = z.infer<typeof AgentTurnKind>;

export const AgentTurn = z.object({
  id: Id,
  agent_id: z.string().min(1),
  agent_type: z.string().min(1),
  session_id: z.string().nullable(),
  message_uuid: z.string().min(1),
  block_index: z.number().int().nonnegative(),
  api_message_id: z.string().nullable(),
  run_id: Id.nullable(),
  role: AgentTurnRole,
  kind: AgentTurnKind,
  tool_use_id: z.string().nullable(),
  tool_name: z.string().nullable(),
  text: z.string().nullable(),
  payload_ref: z.string().nullable(),
  is_error: z.union([z.literal(0), z.literal(1)]).nullable(),
  model: z.string().nullable(),
  input_tokens: z.number().int().nonnegative().nullable(),
  output_tokens: z.number().int().nonnegative().nullable(),
  cache_read_tokens: z.number().int().nonnegative().nullable(),
  cache_creation_tokens: z.number().int().nonnegative().nullable(),
  matched: z.union([z.literal(0), z.literal(1)]),
  created_at: Timestamp,
  imported_at: Timestamp,
});
export type AgentTurn = z.infer<typeof AgentTurn>;
