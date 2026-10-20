// The screens earlier runs recorded on a route join the run's fingerprint index the first time the
// run meets that route (spec 038, LO-35). Each run's index started empty, so a page whose content
// varies between visits (an A/B banner, what another persona sees) opened a new cluster, and with it
// a new screen, in every run that drew the other variant. Seeded, a near-identical page joins the
// known screen as its next revision: one screen with variants. Since spec 039 (T038) the known
// screens are the portal model's where it has one.

import { readFileSync } from 'node:fs';
import { maskText } from '@pathfinder/core';
import {
  computeFingerprint,
  ROWS_V2_PROFILE,
  type FingerprintIndex,
  type FingerprintProfile,
} from '@pathfinder/fingerprint';
import type { ServerContext } from '../context.js';

interface StateRow {
  cluster_id: string;
  fingerprint: string;
  evidence_ref: string;
  screen_rev: number | null;
  /** The portal model's current screen of the state (spec 039), when it has one. */
  model_screen: string | null;
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
  profile: FingerprintProfile = ROWS_V2_PROFILE,
): number {
  // Grouped by the portal model's current screen when the state has one (T038@039: the model's
  // screens, built across every run, are the known screens); else by the crawler's cluster.
  const rows = ctx.raw
    .prepare(
      `SELECT s.cluster_id, s.fingerprint, s.evidence_ref, s.screen_rev,
         (SELECT m.screen_id FROM screen_members m
          WHERE m.state_id = s.id AND m.to_model_version IS NULL) AS model_screen
       FROM states s WHERE s.portal_id = ? AND s.route_template = ?
       ORDER BY s.cluster_id, s.screen_rev IS NULL, s.screen_rev, s.created_at`,
    )
    .all(portalId, routeTemplate) as StateRow[];
  const groups = new Map<string, StateRow[]>();
  for (const r of rows) {
    const key = r.model_screen ? `screen:${r.model_screen}` : `cluster:${r.cluster_id}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  let seeded = 0;
  for (const members of groups.values()) {
    // A model screen may join pages of several crawler clusters; it seeds as its first one.
    const clusterId = members[0]!.cluster_id;
    let snapshot: string;
    try {
      snapshot = readFileSync(ctx.evidence.resolve(members[0]!.evidence_ref), 'utf8');
    } catch {
      continue;
    }
    const representative = computeFingerprint(
      { routeTemplate, ariaSnapshot: maskText(snapshot) },
      profile,
    );
    index.seed(
      clusterId,
      representative,
      members.map((m) => m.fingerprint),
    );
    seeded++;
  }
  return seeded;
}
