import { z } from 'zod';
import { Id } from './common.js';

/** Polymorphic evidence target kind (data-model.md "Evidence Link"). */
export const EvidenceTargetKind = z.enum([
  'state',
  'edge',
  'action',
  'form',
  'network_call',
  'rule_candidate',
  'open_question',
  'decision',
  'process',
  'process_step',
  'doc_record',
  'review',
]);
export type EvidenceTargetKind = z.infer<typeof EvidenceTargetKind>;

const RUN_BOUND_EXEMPT: readonly EvidenceTargetKind[] = ['doc_record', 'review'];

/** `run_id` is resolved by the tool; NULL only for `doc_record`/`review` targets (research.md §5). */
export const DocEvidenceLink = z
  .object({
    id: Id,
    revision_id: Id,
    target_kind: EvidenceTargetKind,
    target_id: Id,
    run_id: Id.nullable(),
    note: z.string().min(1).nullable(),
  })
  .refine((l) => l.run_id !== null || RUN_BOUND_EXEMPT.includes(l.target_kind), {
    message: 'run_id is required unless target_kind is doc_record or review',
    path: ['run_id'],
  });
export type DocEvidenceLink = z.infer<typeof DocEvidenceLink>;
