import { z } from 'zod';
import { Id, Timestamp } from './common.js';

/** The tables migration 0029 adds for MudPuppy 2.0 capture (spec 039 design § 5). */

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

/** One build of one scope of a portal (table `builds`, design § 5.2). */
export const Build = z.object({
  id: Id,
  portal_id: z.string().min(1),
  scope: z.string().min(1),
  signature: z.string().min(1),
  source: z.enum(['assets', 'marker', 'unknown']),
  assets: z.array(z.string()),
  first_seen: Timestamp,
});
export type Build = z.infer<typeof Build>;

/** Fingerprint v2 components of a state (table `state_components`, design § 5.4). */
export const StateComponents = z.object({
  state_id: Id,
  structure_hash: Sha256,
  content_hash: Sha256,
  overlay_hash: Sha256,
  calls_hash: Sha256,
  mounts_hash: Sha256,
  /** 128 MinHash values (stored as a 512-byte blob). */
  minhash: z.array(z.number().int().nonnegative()).length(128),
  element_keys: z.array(z.string()),
});
export type StateComponents = z.infer<typeof StateComponents>;

export const JourneyStartKind = z.enum([
  'entry_url',
  'checkpoint',
  'login',
  'backtrack',
  'resume',
  'fresh_session',
]);
export type JourneyStartKind = z.infer<typeof JourneyStartKind>;

export const JourneyEndReason = z.enum([
  'outcome',
  'backtrack',
  'reset',
  'logout',
  'error',
  'budget',
  'run_end',
]);
export type JourneyEndReason = z.infer<typeof JourneyEndReason>;

/** One continuous path of a run (table `journeys`, design § 5.7). */
export const Journey = z
  .object({
    id: Id,
    run_id: Id,
    parent_journey_id: Id.nullable(),
    branch_seq: z.number().int().nonnegative().nullable(),
    start_kind: JourneyStartKind,
    checkpoint_id: Id.nullable(),
    end_reason: JourneyEndReason.nullable(),
    started_at: Timestamp,
    ended_at: Timestamp.nullable(),
  })
  .refine((j) => (j.parent_journey_id === null) === (j.branch_seq === null), {
    message: 'a child journey has a branch_seq, a root journey none',
  })
  .refine((j) => (j.end_reason === null) === (j.ended_at === null), {
    message: 'end_reason and ended_at are set together',
  });
export type Journey = z.infer<typeof Journey>;

export const AttributeSource = z.enum(['persona', 'input', 'shown']);
export const AttributeValueType = z.enum(['number', 'date', 'enum', 'bool', 'text', 'missing']);

/** A persona attribute, typed input or shown value (table `attribute_writes`, design § 5.8). */
export const AttributeWriteRecord = z.object({
  id: Id,
  journey_id: Id,
  seq: z.number().int().nonnegative(),
  name: z.string().regex(/^(persona|input|shown)\.[\p{L}\p{N}_.]+$/u),
  source: AttributeSource,
  value_type: AttributeValueType,
  value_num: z.number().nullable(),
  value_text: z.string().nullable(),
  element_key: z.string().nullable(),
  created_at: Timestamp,
});
export type AttributeWriteRecord = z.infer<typeof AttributeWriteRecord>;
