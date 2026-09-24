import { z } from 'zod';
import { Id, JsonValue, Timestamp } from './common.js';

export const PortalDataLogAction = z.enum(['export', 'delete']);
export type PortalDataLogAction = z.infer<typeof PortalDataLogAction>;

/** Operator exports and deletions (FR-028). Never deleted by portal:delete; no FK on portal_id. */
export const PortalDataLog = z.object({
  id: Id,
  portal_id: z.string().min(1),
  environment: z.string().min(1),
  action: PortalDataLogAction,
  operator: z.string().min(1),
  counts_json: JsonValue,
  target: z.string().nullable(),
  created_at: Timestamp,
});
export type PortalDataLog = z.infer<typeof PortalDataLog>;
