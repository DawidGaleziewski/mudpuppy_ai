import { maskText, type NavigationHop, type PageVisitVia } from '@pathfinder/core';
import { parseUrlParams } from '@pathfinder/fingerprint';
import { shownValues } from '@pathfinder/model';
import { recordPageVisit, upsertBuilds } from '../../services/page-visits.js';
import { writeAttributes } from '../../services/journeys.js';
import { ensureJourney, nextVisitSeq } from './journey.js';
import type { RunState } from '../run-state.js';
import { markTransitHops } from '../transit.js';
import { audienceKey, contextKey, type PageCapture } from './capture-v2.js';
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
  page: {
    stateId: string;
    url: string;
    edgeId: string | undefined;
    relogged: boolean;
    capture: PageCapture;
    /** The stored snapshot (masked only when the portal scrubs PII): shown values come from it. */
    snapshot: string;
  },
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
    const journeyId = await ensureJourney(ctx, rs);
    const buildIds = await upsertBuilds(ctx, run.portal_id, page.capture.builds);
    const flags = await experimentFlags(rs);
    const { visit_id } = await recordPageVisit(ctx, {
      run_id: run.id,
      state_id: page.stateId,
      edge_id: page.edgeId ?? null,
      via,
      url,
      hops,
      journey_id: journeyId,
      seq: await nextVisitSeq(ctx, rs),
      result: page.capture.result,
      context_key: contextKey(buildIds, audienceKey(rs), flags),
      flags,
      build_ids: buildIds,
    });
    const at = rs.journey!.seq;
    if (!rs.journey!.reached.has(page.stateId)) rs.journey!.reached.set(page.stateId, at);
    rs.lastVisitId = visit_id;
    // What the page shows (label: value) is known from this step on (design § 5.8).
    await writeAttributes(
      ctx,
      journeyId,
      shownValues(page.snapshot).map((v) => ({
        seq: at,
        name: v.label,
        source: 'shown',
        raw: v.value,
      })),
    );
    return reported(visit_id, visitReports(url, hops, via));
  });
}

/** The values of the portal's experiment flags in this session: cookies and web storage keys. */
async function experimentFlags(rs: RunState): Promise<Record<string, string>> {
  const wanted = rs.effective.portal.model.experiment_flags;
  if (wanted.length === 0) return {};
  const out: Record<string, string> = {};
  const cookies = await rs.session.context.cookies().catch(() => []);
  for (const f of wanted) {
    if ('cookie' in f) {
      const c = cookies.find((x) => x.name === f.cookie);
      if (c) out[`cookie:${f.cookie}`] = c.value;
      continue;
    }
    const v = await rs.session.page
      .evaluate(
        (k) => window.localStorage.getItem(k) ?? window.sessionStorage.getItem(k),
        f.storage,
      )
      .catch(() => null);
    if (v !== null) out[`storage:${f.storage}`] = v;
  }
  return out;
}
