import { z } from 'zod';
import { Confidence, Id, Timestamp } from './common.js';
import { DocContent } from './doc-content.js';

export const RevisionStatus = z.enum(['draft', 'confirmed', 'rejected', 'superseded']);
export type RevisionStatus = z.infer<typeof RevisionStatus>;

export const RevisionChange = z.enum(['create', 'revise', 'withdraw']);
export type RevisionChange = z.infer<typeof RevisionChange>;

/** Immutable except `status`, which only the status engine sets (research.md §4). */
export const DocRevision = z
  .object({
    id: Id,
    record_id: Id,
    rev_no: z.number().int().positive(),
    session_id: Id,
    change: RevisionChange,
    content_json: DocContent,
    confidence: Confidence,
    not_observable: z.union([z.literal(0), z.literal(1)]),
    status: RevisionStatus,
    change_note: z.string().min(1).nullable(),
    responds_to_review: Id.nullable(),
    created_at: Timestamp,
  })
  .refine((r) => r.change === 'create' || r.change_note !== null, {
    message: 'change_note is required for revise/withdraw',
    path: ['change_note'],
  });
export type DocRevision = z.infer<typeof DocRevision>;
