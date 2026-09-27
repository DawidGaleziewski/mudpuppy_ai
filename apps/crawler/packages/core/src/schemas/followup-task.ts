import { z } from 'zod';
import { Id, Timestamp } from './common.js';

export const FollowupStatus = z.enum(['open', 'in_progress', 'done', 'blocked', 'cancelled']);
export type FollowupStatus = z.infer<typeof FollowupStatus>;

/** Operational status of a `followup` doc_record; transitions by deterministic code only (research §11). */
export const FollowupTask = z
  .object({
    record_id: Id,
    status: FollowupStatus,
    run_id: Id.nullable(),
    blocked_reason: z.string().min(1).nullable(),
    updated_at: Timestamp,
  })
  .refine((t) => t.status !== 'blocked' || t.blocked_reason !== null, {
    message: 'blocked_reason is required when status is blocked',
    path: ['blocked_reason'],
  });
export type FollowupTask = z.infer<typeof FollowupTask>;
