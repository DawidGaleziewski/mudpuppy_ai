import { z } from 'zod';
import { Id, Timestamp } from './common.js';

export const OpenQuestion = z.object({
  id: Id,
  run_id: Id,
  text: z.string().min(1),
  /** 0040 (spec 039 § 15): the subject, an `entity_refs` row (a state, transition or form). */
  ref_id: Id,
  status: z.enum(['open', 'addressed']),
  created_at: Timestamp,
});
export type OpenQuestion = z.infer<typeof OpenQuestion>;
