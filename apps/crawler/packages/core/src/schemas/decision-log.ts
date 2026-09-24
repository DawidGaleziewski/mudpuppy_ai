import { z } from 'zod';
import { Id, JsonValue, Timestamp } from './common.js';

export const DecisionKind = z.enum(['skip', 'refuse', 'merge', 'split', 'warning', 'note']);
export type DecisionKind = z.infer<typeof DecisionKind>;

export const DecisionLogEntry = z.object({
  id: Id,
  run_id: Id,
  kind: DecisionKind,
  rule: z.string().nullable(),
  reason: z.string().min(1),
  subject_ref: z.string().nullable(),
  detail_json: JsonValue.nullable(),
  created_at: Timestamp,
});
export type DecisionLogEntry = z.infer<typeof DecisionLogEntry>;
