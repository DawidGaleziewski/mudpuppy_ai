import { z } from 'zod';
import { Id, JsonValue, Timestamp } from './common.js';

export const SpanKind = z.enum(['call', 'phase', 'event']);
export type SpanKind = z.infer<typeof SpanKind>;

export const SpanStatus = z.enum(['running', 'ok', 'refused', 'stopped', 'error', 'unfinished']);
export type SpanStatus = z.infer<typeof SpanStatus>;

/** `attrs_json` is a scrubbed JSON object, never a scalar or array (json_type = 'object' in SQL). */
export const AttrsJson = z.record(z.string(), JsonValue);
export type AttrsJson = z.infer<typeof AttrsJson>;

export const TraceSpan = z
  .object({
    id: Id,
    boot_id: Id,
    seq: z.number().int(),
    run_id: Id.nullable(),
    parent_id: Id.nullable(),
    kind: SpanKind,
    name: z.string().min(1),
    status: SpanStatus,
    started_at: Timestamp,
    ended_at: Timestamp.nullable(),
    duration_ms: z.number().int().nonnegative().nullable(),
    attrs_json: AttrsJson,
    payload_ref: z.string().nullable(),
    summary: z.string().min(1),
    decision_id: Id.nullable(),
    tool_use_id: z.string().nullable(),
    agent_id: z.string().nullable(),
    rationale: z.string().max(300).nullable(),
    pw_trace_path: z.string().nullable(),
    between_calls: z.union([z.literal(0), z.literal(1)]),
  })
  .refine(
    (s) =>
      s.duration_ms !== null ||
      s.kind === 'event' ||
      s.status === 'running' ||
      s.status === 'unfinished',
    {
      message: 'duration_ms is required for a completed call/phase span',
      path: ['duration_ms'],
    },
  );
export type TraceSpan = z.infer<typeof TraceSpan>;
