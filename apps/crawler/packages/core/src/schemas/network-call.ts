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
});
export type NetworkCall = z.infer<typeof NetworkCall>;
