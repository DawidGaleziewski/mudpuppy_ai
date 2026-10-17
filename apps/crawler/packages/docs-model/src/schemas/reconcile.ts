import { z } from 'zod';
import { Id, Timestamp } from '@pathfinder/core';

/** What a state of a differing-states group is, by the BA's reading (spec 033 data-model.md). */
export const Verdict = z.enum([
  'main',
  'variant_persona',
  'variant_input',
  'variant_flag',
  'validation',
  'technical',
  'temporary',
  'same',
]);
export type Verdict = z.infer<typeof Verdict>;

/** Why the states differ, as the BA guesses it. */
export const Hypothesis = z.enum(['persona', 'input', 'temporary', 'session_time', 'flag', 'data']);
export type Hypothesis = z.infer<typeof Hypothesis>;

export const ReconcileGroupKind = z.enum(['action', 'route', 'replay']);
export type ReconcileGroupKind = z.infer<typeof ReconcileGroupKind>;

export const ReconciliationStatus = z.enum(['proposed', 'confirmed', 'superseded']);
export type ReconciliationStatus = z.infer<typeof ReconciliationStatus>;

export const ProposedVerdict = z
  .object({
    state_id: Id,
    verdict: Verdict,
    hypothesis: Hypothesis,
    reason: z.string().min(1).max(400),
  })
  .strict();
export type ProposedVerdict = z.infer<typeof ProposedVerdict>;

export const ConfirmedVerdict = z.object({ state_id: Id, verdict: Verdict }).strict();
export type ConfirmedVerdict = z.infer<typeof ConfirmedVerdict>;

/** Row of `reconciliations` (0025); `confirmed_*` are set iff `status` is `confirmed`. */
export const ReconciliationRow = z
  .object({
    id: Id,
    portal_id: z.string().min(1),
    group_key: z.string().min(1),
    group_kind: ReconcileGroupKind,
    snapshot_json: z.record(z.string(), z.unknown()),
    proposal_json: z.array(ProposedVerdict),
    proposed_by: z.string().min(1),
    proposed_at: Timestamp,
    status: ReconciliationStatus,
    confirmed_json: z.array(ConfirmedVerdict).nullable(),
    confirmed_by: z.string().min(1).nullable(),
    confirmed_at: Timestamp.nullable(),
  })
  .strict()
  .refine(
    (r) =>
      (r.status === 'confirmed') === (r.confirmed_json !== null) &&
      (r.confirmed_json === null) === (r.confirmed_by === null) &&
      (r.confirmed_json === null) === (r.confirmed_at === null),
    { message: 'confirmed_json, confirmed_by and confirmed_at are set iff status is confirmed' },
  );
export type ReconciliationRow = z.infer<typeof ReconciliationRow>;
