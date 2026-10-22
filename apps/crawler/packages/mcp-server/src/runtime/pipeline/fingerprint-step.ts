import { maskText } from '@mudpuppy/core';
import type { observePage } from '@mudpuppy/crawler';
import { computeFingerprint } from '@mudpuppy/fingerprint';
import { seedKnownClusters } from '../../services/known-clusters.js';
import { decision, event, reported, step, type StepContext } from './context.js';

export type Observed = Awaited<ReturnType<typeof observePage>>;

/** Chromium's own page for a navigation that never got a document (blocked, offline, aborted). */
export const isBrowserErrorPage = (url: string): boolean => url.startsWith('chrome-error:');

/** Fingerprint the observed page and assign it to a cluster; the assignment is a decision. */
export function fingerprintStep(sc: StepContext, observed: Observed) {
  const { rs } = sc;
  return step(sc, 'fingerprint', () => {
    // Masking normalises personal values for the fingerprint either way, so clusters stay stable;
    // whether the stored snapshot is masked is the portal's `pii_scrub` (constitution 2.0.0).
    const masked = maskText(observed.ariaSnapshot);
    // A blocked, offline or aborted submit shows Chromium's own error page, whose URL
    // (`chrome-error://chromewebdata/`) parses to `/`: it belongs to the page that submitted, not
    // to the home page (spec 036 FR-002, F-11@034).
    const browserError = isBrowserErrorPage(observed.url);
    const routeTemplate =
      browserError && rs.lastPageRoute !== null
        ? rs.lastPageRoute
        : rs.routeTemplateFor(observed.url);
    if (!browserError) rs.lastPageRoute = routeTemplate;
    if (!rs.seededRoutes.has(routeTemplate)) {
      rs.seededRoutes.add(routeTemplate);
      seedKnownClusters(sc.ctx, rs.index, sc.run.portal_id, routeTemplate, rs.profile);
    }
    const fp = computeFingerprint({ routeTemplate, ariaSnapshot: masked }, rs.profile);
    const assignment = rs.index.assign(fp);
    const { kind, reason, similarity, threshold, matchedFingerprint } = assignment.decision;
    return Promise.resolve(
      reported({ masked, routeTemplate, fp, assignment, browserError }, [
        decision({
          kind,
          rule: `fingerprint:${reason}`,
          reason: `${kind} into ${assignment.clusterId} (similarity ${similarity.toFixed(2)}, threshold ${threshold})`,
          subject_ref: fp.level1,
          detail: { matched: matchedFingerprint, route_template: routeTemplate },
        }),
        event('fingerprint_assign', {
          route_template: routeTemplate,
          level1: fp.level1,
          decision: kind,
          cluster_id: assignment.clusterId,
          matched: matchedFingerprint ?? null,
          similarity,
          threshold,
        }),
      ]),
    );
  });
}

export type Fingerprinted = Awaited<ReturnType<typeof fingerprintStep>>;
