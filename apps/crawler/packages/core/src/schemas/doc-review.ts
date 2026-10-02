import { z } from 'zod';
import { Id, Timestamp } from './common.js';

export const ReviewAction = z.enum(['confirm', 'reject', 'comment']);
export type ReviewAction = z.infer<typeof ReviewAction>;

/** Written only by `docs:review`. `text` is required for `reject` and `comment`. */
export const DocReview = z
  .object({
    id: Id,
    revision_id: Id,
    action: ReviewAction,
    reviewer: z.string().min(1),
    text: z.string().min(1).nullable(),
    created_at: Timestamp,
  })
  .refine((r) => r.action === 'confirm' || r.text !== null, {
    message: 'text is required for reject and comment',
    path: ['text'],
  });
export type DocReview = z.infer<typeof DocReview>;
