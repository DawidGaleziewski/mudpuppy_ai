import { z } from 'zod';
import { EvidenceRef, Id, Timestamp } from './common.js';

export const RobotsOutcome = z.enum(['rules', 'no_rules', 'unreachable']);
export type RobotsOutcome = z.infer<typeof RobotsOutcome>;

/** One fetched robots.txt per host per fetch (FR-001 to FR-007). Latest row per (run_id, host) is in force. */
export const RobotsPolicy = z.object({
  id: Id,
  run_id: Id,
  host: z.string().min(1),
  source_url: z.string().min(1),
  final_url: z.string().nullable(),
  outcome: RobotsOutcome,
  http_status: z.number().int().nullable(),
  product_token: z.string().min(1),
  group_used: z.string().nullable(),
  crawl_delay_s: z.number().nullable(),
  ignored_lines: z.number().int().nonnegative(),
  truncated: z.union([z.literal(0), z.literal(1)]),
  content_sha256: z.string().nullable(),
  evidence_ref: EvidenceRef,
  fetched_at: Timestamp,
});
export type RobotsPolicy = z.infer<typeof RobotsPolicy>;
