import { z } from 'zod';
import { EvidenceRef, Id, Timestamp } from './common.js';

export const RuleCandidate = z.object({
  id: Id,
  run_id: Id,
  text: z.string().min(1),
  about_ref: Id,
  evidence_ref: EvidenceRef,
  /** Fixed by the server; the agent cannot set it. */
  confidence: z.literal('inferred'),
  created_at: Timestamp,
});
export type RuleCandidate = z.infer<typeof RuleCandidate>;
