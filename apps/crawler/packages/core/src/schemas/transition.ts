import { z } from 'zod';
import {
  Confidence,
  Driver,
  TransitionStatus,
  StepResult,
  TransitionKind,
  EvidenceRef,
  Id,
  JsonValue,
  SafetyClass,
  Stabilization,
  Timestamp,
} from './common.js';

/** One step from a state through an action (table `transitions`, v1's `edges`; renamed by 0032). */
export const Transition = z.object({
  id: Id,
  run_id: Id,
  from_state: Id,
  to_state: Id.nullable(),
  action_json: JsonValue,
  safety_class: SafetyClass,
  status: TransitionStatus,
  evidence_ref: EvidenceRef,
  confidence: Confidence,
  error: JsonValue.nullable(),
  stabilization: Stabilization,
  created_at: Timestamp,
  /** 0029 (spec 039 design § 5.7): the journey position. NULL on v1 rows. */
  journey_id: Id.nullable().optional(),
  seq: z.number().int().positive().nullable().optional(),
  from_observation_id: Id.nullable().optional(),
  element_key: z.string().nullable().optional(),
  kind: TransitionKind.nullable().optional(),
  result: StepResult.nullable().optional(),
  driver: Driver.default('agent'),
});
export type Transition = z.infer<typeof Transition>;
