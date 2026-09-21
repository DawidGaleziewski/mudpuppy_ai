import { z } from 'zod';
import { Id, JsonValue, SafetyClass, Timestamp } from './common.js';

/** Server-issued action ids; the only ids `act` accepts. */
export const Action = z
  .object({
    id: Id,
    run_id: Id,
    state_id: Id,
    role: z.string().min(1),
    accessible_name: z.string().nullable(),
    action_json: JsonValue,
    safety_class: SafetyClass,
    allowed: z.boolean(),
    skip_reason: z.string().nullable(),
    created_at: Timestamp,
  })
  .refine((a) => a.allowed || (a.skip_reason !== null && a.skip_reason.length > 0), {
    message: 'skip_reason is required when allowed is false',
    path: ['skip_reason'],
  });
export type Action = z.infer<typeof Action>;
