import { z } from 'zod';
import { Confidence, EvidenceRef, Id, JsonValue, Timestamp } from './common.js';

export const Form = z.object({
  id: Id,
  run_id: Id,
  state_id: Id,
  fields_json: JsonValue,
  evidence_ref: EvidenceRef,
  confidence: Confidence,
  created_at: Timestamp,
});
export type Form = z.infer<typeof Form>;
