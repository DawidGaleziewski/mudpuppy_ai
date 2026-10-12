import { z } from 'zod';
import { Id, Timestamp } from './common.js';

/**
 * How the browser got from one URL to the next within one step (spec 019 R4): `start` is the URL the
 * step began on (the `navigate` target, or the page before an action); `navigate` the step's own
 * document load (the link or form the action followed); `http` a 3xx response; `meta_refresh` and
 * `script` client-side redirects; `same_document` a history-API or hash change without a document
 * load; `reload` a full reload of the same URL; `blocked` a hop not followed (with the reason).
 */
export const HopKind = z.enum([
  'start',
  'navigate',
  'http',
  'meta_refresh',
  'script',
  'same_document',
  'reload',
  'blocked',
]);
export type HopKind = z.infer<typeof HopKind>;

export const NavigationHop = z.object({
  url: z.string().min(1),
  kind: HopKind,
  /** HTTP status of the response that redirected (kind `http` only). */
  status: z.number().int().optional(),
  /** Why the hop was not followed (kind `blocked` only). */
  reason: z.string().optional(),
});
export type NavigationHop = z.infer<typeof NavigationHop>;

/** How the step reached the page: the agent's `navigate`, an action, a re-login return, the login. */
export const PageVisitVia = z.enum(['navigate', 'action', 'relogin', 'login']);
export type PageVisitVia = z.infer<typeof PageVisitVia>;

/**
 * One arrival on a page (table `page_visits`, 0012): the verbatim URL with every query and path
 * parameter, session ids included (R-37), and the hops that led there (R-38).
 */
export const PageVisit = z.object({
  id: Id,
  run_id: Id,
  state_id: Id,
  edge_id: Id.nullable(),
  via: PageVisitVia,
  url: z.string().min(1),
  hops: z.array(NavigationHop),
  created_at: Timestamp,
});
export type PageVisit = z.infer<typeof PageVisit>;
