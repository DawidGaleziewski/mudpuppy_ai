import { z } from 'zod';
import { FrontierStatus, Id, JsonValue, SafetyClass, Timestamp } from './common.js';

export const FrontierItemStatus = z.enum(['pending', 'done', ...FrontierStatus.options]);
export type FrontierItemStatus = z.infer<typeof FrontierItemStatus>;

export const FrontierItem = z
  .object({
    id: Id,
    run_id: Id,
    state_id: Id,
    action_id: Id.nullable(),
    action_json: JsonValue,
    safety_class: SafetyClass,
    status: FrontierItemStatus,
    priority: z.number().int(),
    depth: z.number().int().nonnegative(),
    reason: z.string().nullable(),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .refine(
    (f) =>
      f.status === 'pending' || f.status === 'done' || (f.reason !== null && f.reason.length > 0),
    {
      message: 'reason is required for every skip status',
      path: ['reason'],
    },
  );
export type FrontierItem = z.infer<typeof FrontierItem>;
