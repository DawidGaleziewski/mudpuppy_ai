import { z } from 'zod';
import { Confidence, EvidenceRef, Id, Stabilization, Timestamp } from './common.js';

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
});
export type State = z.infer<typeof State>;

export const StateObservation = z.object({
  run_id: Id,
  state_id: Id,
  persona_id: z.string().min(1),
  evidence_ref: EvidenceRef,
  observed_at: Timestamp,
});
export type StateObservation = z.infer<typeof StateObservation>;
