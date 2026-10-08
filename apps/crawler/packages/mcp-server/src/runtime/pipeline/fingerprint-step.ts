import { maskText } from '@pathfinder/core';
import type { observePage } from '@pathfinder/crawler';
import { computeFingerprint } from '@pathfinder/fingerprint';
import { decision, event, reported, step, type StepContext } from './context.js';

export type Observed = Awaited<ReturnType<typeof observePage>>;

/** Fingerprint the observed page and assign it to a cluster; the assignment is a decision. */
export function fingerprintStep(sc: StepContext, observed: Observed) {
  const { rs } = sc;
  return step(sc, 'fingerprint', () => {
    // Masking normalises personal values for the fingerprint either way, so clusters stay stable;
    // whether the stored snapshot is masked is the portal's `pii_scrub` (constitution 2.0.0).
    const masked = maskText(observed.ariaSnapshot);
    const routeTemplate = rs.routeTemplateFor(observed.url);
    const fp = computeFingerprint({ routeTemplate, ariaSnapshot: masked });
    const assignment = rs.index.assign(fp);
    const { kind, reason, similarity, threshold, matchedFingerprint } = assignment.decision;
    return Promise.resolve(
      reported({ masked, routeTemplate, fp, assignment }, [
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
