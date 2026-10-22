import { z } from 'zod';
import { Id } from '@mudpuppy/core';

/** Polymorphic evidence target kind (data-model.md "Evidence Link"; `screen_region` spec 008). */
export const EvidenceTargetKind = z.enum([
  'state',
  'transition',
  'action',
  'form',
  'network_call',
  'open_question',
  'decision',
  'process',
  'process_step',
  'doc_record',
  'review',
  'screen_region',
  // spec 019 (R-37): an observation's verbatim URL is the evidence for a parameter dependency
  'observation',
  // spec 039 (owner answer 18): the portal model's hypothesis a record documents, above all a mined
  // decision rule (H-nnnn), so the rule and its business rule record share the BR key
  'hypothesis',
]);
export type EvidenceTargetKind = z.infer<typeof EvidenceTargetKind>;

const RUN_BOUND_EXEMPT: readonly EvidenceTargetKind[] = ['doc_record', 'review', 'hypothesis'];

/**
 * `run_id` is resolved by the tool; NULL only for `doc_record`/`review`/`hypothesis` targets (research.md §5).
 * `region` is the cited element key, set iff `target_kind` is `screen_region` (target_id = state id).
 */
export const DocEvidenceLink = z
  .object({
    id: Id,
    revision_id: Id,
    target_kind: EvidenceTargetKind,
    target_id: Id,
    run_id: Id.nullable(),
    note: z.string().min(1).nullable(),
    region: z.string().min(1).nullable().default(null),
  })
  .refine((l) => l.run_id !== null || RUN_BOUND_EXEMPT.includes(l.target_kind), {
    message: 'run_id is required unless target_kind is doc_record, review or hypothesis',
    path: ['run_id'],
  })
  .refine((l) => (l.target_kind === 'screen_region') === (l.region !== null), {
    message: 'region is required for screen_region and only allowed there',
    path: ['region'],
  });
export type DocEvidenceLink = z.infer<typeof DocEvidenceLink>;
