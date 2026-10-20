import { z } from 'zod';
import { Id, JsonValue, RunStatus, Timestamp } from './common.js';

/** `mode` is a plain string in SQL (no CHECK, FR-022); Zod is the only place the values are enforced. */
export const RunMode = z.enum(['map', 'trace']);

/** `runs.run_type` (0027): CHECK-constrained in SQL; null means a plain run. */
export const RunType = z.enum([
  'full',
  'continue',
  'focused',
  'recheck',
  'retry',
  'probe',
  'trace',
]);
export type RunType = z.infer<typeof RunType>;

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
    /** The pathfinder server instance driving the run and its process id (0009, F-14). */
    owner_id: z.string().min(1).nullable(),
    owner_pid: z.number().int().positive().nullable(),
    /** 0027 (spec 034): the kind of directed run; null = a plain run (full map or trace by `mode`). */
    run_type: RunType.nullable().default(null),
    /** 0027: the run a directed run continues or retries. */
    parent_run_id: Id.nullable().default(null),
    /** 0027: the plan the run came from (start state ids, skip targets, depth, variation, target transition, marks used). */
    plan_json: JsonValue.nullable().default(null),
  })
  .refine((r) => r.status !== 'stopped_warning' || r.warning !== null, {
    message: 'warning is required when status is stopped_warning',
    path: ['warning'],
  });
export type Run = z.infer<typeof Run>;
