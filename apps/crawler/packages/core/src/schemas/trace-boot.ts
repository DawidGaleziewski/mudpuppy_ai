import { z } from 'zod';
import { Id, Timestamp } from './common.js';

export const TraceServer = z.enum(['pathfinder']);
export type TraceServer = z.infer<typeof TraceServer>;

export const TraceLevel = z.enum(['off', 'standard', 'verbose']);
export type TraceLevel = z.infer<typeof TraceLevel>;

export const PwTraceMode = z.enum(['non_production', 'all']);
export type PwTraceMode = z.infer<typeof PwTraceMode>;

export const TraceBoot = z.object({
  id: Id,
  started_at: Timestamp,
  ended_at: Timestamp.nullable(),
  environment: z.string().min(1),
  server: TraceServer,
  pid: z.number().int(),
  version: z.string().min(1),
  trace_level: TraceLevel,
  pw_trace: PwTraceMode,
});
export type TraceBoot = z.infer<typeof TraceBoot>;
