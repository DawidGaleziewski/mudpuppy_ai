import { z } from 'zod';
import { Id, Timestamp } from './common.js';

/**
 * A screen (`screens`, 0015): one view of a portal, identified by `(portal_id, route_template,
 * cluster_id)`. Each state is one observed revision of its screen (`states.screen_id` +
 * `states.screen_rev`, r1, r2, ... by first sighting). Spec 022 research.md R1.
 */
export const Screen = z.object({
  id: Id,
  portal_id: z.string().min(1),
  route_template: z.string().min(1),
  cluster_id: z.string().min(1),
  /** Title of the latest revision; display only. */
  title: z.string(),
  first_seen_run: Id,
  created_at: Timestamp,
});
export type Screen = z.infer<typeof Screen>;
