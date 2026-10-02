import { z } from 'zod';
import { Id, Timestamp } from './common.js';

export const AnalysisSessionStatus = z.enum(['running', 'completed', 'interrupted']);
export type AnalysisSessionStatus = z.infer<typeof AnalysisSessionStatus>;

/** The seven BA analysis passes (data-model.md "Analysis Session"). */
export const AnalysisPass = z.enum([
  'inventory',
  'capabilities',
  'processes',
  'rules',
  'data',
  'nfr',
  'synthesis',
]);
export type AnalysisPass = z.infer<typeof AnalysisPass>;

export const AnalysisSessionPassEntry = z.object({
  pass: AnalysisPass,
  summary: z.string().min(1),
  completed_at: Timestamp,
});
export type AnalysisSessionPassEntry = z.infer<typeof AnalysisSessionPassEntry>;

export const AnalysisSession = z
  .object({
    id: Id,
    portal_id: z.string().min(1),
    status: AnalysisSessionStatus,
    passes_json: z.array(AnalysisSessionPassEntry),
    summary: z.string().min(1).nullable(),
    gaps_json: z.array(z.string().min(1)),
    started_at: Timestamp,
    ended_at: Timestamp.nullable(),
  })
  .refine((s) => s.status !== 'completed' || s.summary !== null, {
    message: 'summary is required when status is completed',
    path: ['summary'],
  });
export type AnalysisSession = z.infer<typeof AnalysisSession>;

/** Which runs a session read; must belong to the session's portal (tool check, not schema). */
export const AnalysisSessionRun = z.object({
  session_id: Id,
  run_id: Id,
});
export type AnalysisSessionRun = z.infer<typeof AnalysisSessionRun>;
