import { z } from 'zod';
import { Id, Timestamp } from './common.js';

export const OpenQuestion = z.object({
  id: Id,
  run_id: Id,
  text: z.string().min(1),
  about_ref: Id,
  status: z.enum(['open', 'addressed']),
  created_at: Timestamp,
});
export type OpenQuestion = z.infer<typeof OpenQuestion>;
