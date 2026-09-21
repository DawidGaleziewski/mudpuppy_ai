import { z } from 'zod';
import {
  Confidence,
  EdgeStatus,
  EvidenceRef,
  Id,
  JsonValue,
  SafetyClass,
  Stabilization,
  Timestamp,
} from './common.js';

export const Edge = z.object({
  id: Id,
  run_id: Id,
  from_state: Id,
  to_state: Id.nullable(),
  action_json: JsonValue,
  safety_class: SafetyClass,
  status: EdgeStatus,
  evidence_ref: EvidenceRef,
  confidence: Confidence,
  error: JsonValue.nullable(),
  stabilization: Stabilization,
  created_at: Timestamp,
});
export type Edge = z.infer<typeof Edge>;
