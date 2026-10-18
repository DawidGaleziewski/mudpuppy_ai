import { z } from 'zod';
import { Id, JsonValue, Timestamp } from './common.js';

/** Shape-only observation: carries neither evidence_ref nor confidence (decision R-04). */
export const NetworkCall = z.object({
  id: Id,
  run_id: Id,
  edge_id: Id.nullable(),
  method: z.string().min(1),
  url_template: z.string().min(1),
  status: z.number().int(),
  req_schema: JsonValue,
  res_schema: JsonValue,
  console_errors: z.array(z.string()),
  created_at: Timestamp,
  /** 0012 (spec 019): the verbatim request URL, query kept; null on rows recorded before. */
  url: z.string().min(1).nullable().optional(),
  /** 0027 (spec 034): masked sample bodies, at most 4096 characters, recorded only outside production. */
  req_sample: z.string().max(4096).nullable().optional(),
  res_sample: z.string().max(4096).nullable().optional(),
  /** 0029 (spec 039 design § 5.3): sha256 of the response shape; null for documents and v1 rows. */
  schema_hash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable()
    .optional(),
});
export type NetworkCall = z.infer<typeof NetworkCall>;
