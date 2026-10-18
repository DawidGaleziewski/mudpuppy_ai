// The screens earlier runs recorded on a route join the run's fingerprint index the first time the
// run meets that route (spec 038, LO-35). Each run's index started empty, so a page whose content
// varies between visits (an A/B banner, what another persona sees) opened a new cluster, and with it
// a new screen, in every run that drew the other variant. Seeded, a near-identical page joins the
// known screen as its next revision: one screen with variants.

import { readFileSync } from 'node:fs';
import { maskText } from '@pathfinder/core';
import { computeFingerprint, type FingerprintIndex } from '@pathfinder/fingerprint';
import type { ServerContext } from '../context.js';

interface StateRow {
  cluster_id: string;
  fingerprint: string;
  evidence_ref: string;
  screen_rev: number | null;
}

/**
 * Seed `index` with every known cluster of `routeTemplate` on the portal: its first revision's
 * snapshot as the representative (fingerprinted the way the pipeline does: masked), and every
 * recorded state of the cluster as an exact match. A snapshot that cannot be read leaves its cluster
 * out; the page then simply starts a cluster of its own, as before.
 */
export function seedKnownClusters(
  ctx: Pick<ServerContext, 'raw' | 'evidence'>,
  index: FingerprintIndex,
  portalId: string,
  routeTemplate: string,
): number {
  const rows = ctx.raw
    .prepare(
      `SELECT cluster_id, fingerprint, evidence_ref, screen_rev FROM states
       WHERE portal_id = ? AND route_template = ?
       ORDER BY cluster_id, screen_rev IS NULL, screen_rev, created_at`,
    )
    .all(portalId, routeTemplate) as StateRow[];
  const byCluster = new Map<string, StateRow[]>();
  for (const r of rows) byCluster.set(r.cluster_id, [...(byCluster.get(r.cluster_id) ?? []), r]);
  let seeded = 0;
  for (const [clusterId, members] of byCluster) {
    let snapshot: string;
    try {
      snapshot = readFileSync(ctx.evidence.resolve(members[0]!.evidence_ref), 'utf8');
    } catch {
      continue;
    }
    const representative = computeFingerprint({ routeTemplate, ariaSnapshot: maskText(snapshot) });
    index.seed(
      clusterId,
      representative,
      members.map((m) => m.fingerprint),
    );
    seeded++;
  }
  return seeded;
}
