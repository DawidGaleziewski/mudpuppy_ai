import { maskText, type NavigationHop, type PageVisitVia } from '@pathfinder/core';
import { parseUrlParams } from '@pathfinder/fingerprint';
import { recordPageVisit } from '../../services/index.js';
import { markTransitHops } from '../transit.js';
import { event, reported, step, type Report, type StepContext } from './context.js';

/** How this call reached its page, for the visit row. */
export function visitVia(sc: StepContext, relogged: boolean): PageVisitVia {
  if (relogged) return 'relogin';
  if (sc.via.kind === 'act') return 'action';
  return sc.visitVia ?? 'navigate';
}

/** `event page_visit`: the URL's parameter count and the hop kinds, never the values (trace size). */
export function visitReports(
  url: string,
  hops: readonly NavigationHop[],
  via: PageVisitVia,
): Report[] {
  return [
    event('page_visit', {
      via,
      params: parseUrlParams(url).length,
      hops: hops.map((h) => h.kind),
    }),
  ];
}

/**
 * Record the page's verbatim URL and the hops that led to it (spec 019, R-37/R-38). A portal with
 * `pii_scrub` gets its URLs masked like every other stored text; otherwise nothing is dropped.
 */
export function recordVisitStep(
  sc: StepContext,
  page: { stateId: string; url: string; edgeId: string | undefined; relogged: boolean },
): Promise<string> {
  const { ctx, run, rs } = sc;
  return step(sc, 'record_visit', async () => {
    const scrub = rs.effective.portal.pii_scrub;
    const keep = (u: string) => (scrub ? maskText(u) : u);
    const drained = (await rs.session.navigation.drain()).map((h) => ({ ...h, url: keep(h.url) }));
    // A login's chain carries its transit pages (spec 037 FR-006); the zone ends with it.
    const hops = rs.transit === null ? drained : markTransitHops(drained, rs.transit);
    rs.transit = null;
    const url = keep(page.url);
    const via = visitVia(sc, page.relogged);
    const { visit_id } = await recordPageVisit(ctx, {
      run_id: run.id,
      state_id: page.stateId,
      edge_id: page.edgeId ?? null,
      via,
      url,
      hops,
    });
    return reported(visit_id, visitReports(url, hops, via));
  });
}
