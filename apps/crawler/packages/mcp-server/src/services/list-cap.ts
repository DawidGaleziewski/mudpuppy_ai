// The stopping rule for item lists and pagination (spec 080 FR-009, R-35; F-17@015, F-08@019).
// In the shop eval 214 items were left pending, most of them catalogue pages (`?strona=n`) and
// product cards: each address is an item, and every one showed the same screen. Once a run has
// visited `max_items_per_template` addresses of one route template and all of them were the same
// state, its other links to that template are settled `budget_reached` (`list_cap`) when handed
// out, never given to the agent. A template whose pages differ, or whose parameter the portal
// model holds as `identity` (2.0's parameter roles: the value names the screen), is never capped.

import { inferRouteTemplates } from '@mudpuppy/fingerprint';
import { nowIso } from '@mudpuppy/core';
import type { ServerContext } from '../context.js';
import { linkTarget, type FrontierRow } from './same-target.js';

/** The visited addresses of one template and the states they showed. */
interface Visited {
  urls: Set<string>;
  states: Set<string>;
}

/**
 * Why `target` is capped, or null: `cap` or more visited addresses of its template, one state
 * for all of them, the target itself not among them, and no identity parameter on the template.
 */
export function capReason(
  target: string,
  visited: readonly { url: string; state_id: string; route_template: string }[],
  opts: { cap: number; identityTemplates: ReadonlySet<string> },
): string | null {
  const templater = inferRouteTemplates([...visited.map((v) => v.url), target]);
  const template = templater.templateFor(target);
  const seen: Visited = { urls: new Set(), states: new Set() };
  const routes = new Set<string>();
  for (const v of visited)
    if (templater.templateFor(v.url) === template) {
      seen.urls.add(v.url);
      seen.states.add(v.state_id);
      routes.add(v.route_template);
    }
  if (seen.urls.has(target) || seen.urls.size < opts.cap || seen.states.size !== 1) return null;
  if ([template, ...routes].some((t) => opts.identityTemplates.has(t))) return null;
  return `list_cap: ${String(seen.urls.size)} addresses of ${template} all showed the same screen`;
}

/** Route templates with an identity parameter in the portal model (a person's or derived). */
function identityTemplates(ctx: ServerContext, portalId: string): Set<string> {
  const rows = ctx.raw
    .prepare(
      "SELECT DISTINCT route_template FROM parameter_roles WHERE portal_id = ? AND role = 'identity'",
    )
    .all(portalId) as { route_template: string }[];
  return new Set(rows.map((r) => r.route_template));
}

/** Settle a link item past the list cap; false, changing nothing, when it is not capped. */
export async function settleListCap(
  ctx: ServerContext,
  row: FrontierRow,
  run: { portal_id: string; cap: number },
): Promise<boolean> {
  const target = linkTarget(row);
  if (target === null) return false;
  const visited = ctx.raw
    .prepare(
      `SELECT DISTINCT o.url, o.state_id, s.route_template FROM observations o
       JOIN states s ON s.id = o.state_id WHERE o.run_id = ?`,
    )
    .all(row.run_id) as { url: string; state_id: string; route_template: string }[];
  const reason = capReason(target, visited, {
    cap: run.cap,
    identityTemplates: identityTemplates(ctx, run.portal_id),
  });
  if (reason === null) return false;
  await ctx.db
    .updateTable('frontier')
    .set({ status: 'budget_reached', reason, updated_at: nowIso() })
    .where('id', '=', row.id)
    .execute();
  ctx.tracer.event('frontier_skip', { frontier_id: row.id, rule: 'list_cap', reason });
  return true;
}
