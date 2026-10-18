import { z } from 'zod';
import {
  Confidence,
  Driver,
  EdgeStatus,
  StepResult,
  TransitionKind,
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
  /** 0029 (spec 039 design § 5.7): the edge as a transition. NULL on v1 rows. */
  journey_id: Id.nullable().optional(),
  seq: z.number().int().positive().nullable().optional(),
  from_visit_id: Id.nullable().optional(),
  element_key: z.string().nullable().optional(),
  kind: TransitionKind.nullable().optional(),
  result: StepResult.nullable().optional(),
  driver: Driver.default('agent'),
});
export type Edge = z.infer<typeof Edge>;
