import { z } from 'zod';
import { Confidence, EvidenceRef, Id, Timestamp } from './common.js';

export const ProcessStepKind = z.enum(['navigate', 'click', 'fill', 'check', 'select']);
export type ProcessStepKind = z.infer<typeof ProcessStepKind>;

/** One recorded step of a process (data-model.md "Process Step"); `outcomes_json` is derived by the server. */
export const ProcessStep = z.object({
  id: Id,
  process_id: Id,
  ord: z.number().int().min(1),
  intent: z.string().min(1),
  kind: ProcessStepKind,
  /** NULL for `navigate`. */
  action_id: Id.nullable(),
  edge_id: Id.nullable(),
  /** Scrubbed synthetic input for `fill`/`select`; NULL otherwise. */
  value: z.string().nullable(),
  state_before: Id.nullable(),
  /** NULL if nothing changed or settled. */
  state_after: Id.nullable(),
  outcomes_json: z.array(z.string()),
  evidence_ref: EvidenceRef,
  confidence: Confidence,
  created_at: Timestamp,
});
export type ProcessStep = z.infer<typeof ProcessStep>;
