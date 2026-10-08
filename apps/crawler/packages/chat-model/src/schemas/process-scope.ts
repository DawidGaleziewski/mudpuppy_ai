import { z } from 'zod';
import { Id, Timestamp } from '@pathfinder/core';

export const ProcessScopeSource = z.enum(['agent_proposal', 'ba_description']);
export type ProcessScopeSource = z.infer<typeof ProcessScopeSource>;

/** The states the BA narrowed a process down to (`process_scopes`, 0008). */
export const ProcessScope = z.object({
  id: Id,
  conversation_id: Id,
  portal_id: z.string().min(1),
  process_name: z.string().min(1),
  persona: z.string().min(1),
  start_state_id: Id,
  end_state_id: Id,
  /** JSON array of state ids. */
  selected_state_ids: z.array(Id),
  /** JSON object: state id -> comment text. */
  comments: z.record(z.string(), z.string()),
  source: ProcessScopeSource,
  created_at: Timestamp,
});
export type ProcessScope = z.infer<typeof ProcessScope>;
