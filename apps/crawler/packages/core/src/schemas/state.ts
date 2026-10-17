import { z } from 'zod';
import { Confidence, EvidenceRef, Id, JsonValue, Stabilization, Timestamp } from './common.js';
import { StateKind } from './probe.js';

export const State = z.object({
  id: Id,
  portal_id: z.string().min(1),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 hex'),
  cluster_id: z.string().min(1),
  route_template: z.string().min(1),
  title: z.string(),
  evidence_ref: EvidenceRef,
  confidence: Confidence,
  stabilization: Stabilization,
  first_seen_run: Id,
  created_at: Timestamp,
  /** 0015: the screen this state is a revision of; NULL only for rows an old crawler wrote. */
  screen_id: Id.nullable(),
  /** 0015: r1, r2, ... by first sighting within the screen (>= 1); NULL with screen_id. */
  screen_rev: z.number().int().min(1).nullable(),
  /** 0022: the form step this state shows; NULL: no controls, or recorded before 0022. */
  form_step_id: Id.nullable(),
  /** 0022: `main` (default), `validation` (error signals shown) or `technical` (reached by a fault). */
  state_kind: StateKind,
});
export type State = z.infer<typeof State>;

export const StateObservation = z.object({
  run_id: Id,
  state_id: Id,
  persona_id: z.string().min(1),
  evidence_ref: EvidenceRef,
  observed_at: Timestamp,
  composition_json: JsonValue.nullable(),
});
export type StateObservation = z.infer<typeof StateObservation>;
