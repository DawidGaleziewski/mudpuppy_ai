import { z } from 'zod';
import { Id, JsonValue, RunStatus, Timestamp } from './common.js';

/** `mode` is a plain string constrained here only: `trace` must not need a schema change (FR-022). */
export const RunMode = z.enum(['map']);

export const Run = z
  .object({
    id: Id,
    portal_id: z.string().min(1),
    persona_id: z.string().min(1),
    mode: RunMode,
    environment: z.string().min(1),
    env_version_or_date: z.string().min(1),
    seed_id: z.string().nullable(),
    viewport: z.string().min(1),
    locale: z.string().min(1),
    browser: z.string().min(1),
    config_snapshot: JsonValue,
    status: RunStatus,
    warning: z.string().nullable(),
    steps_used: z.number().int().nonnegative(),
    elapsed_ms: z.number().int().nonnegative(),
    max_depth_reached: z.number().int().nonnegative(),
    started_at: Timestamp,
    ended_at: Timestamp.nullable(),
    coverage: JsonValue.nullable(),
  })
  .refine((r) => r.status !== 'stopped_warning' || r.warning !== null, {
    message: 'warning is required when status is stopped_warning',
    path: ['warning'],
  });
export type Run = z.infer<typeof Run>;
