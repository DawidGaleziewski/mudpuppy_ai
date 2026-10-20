/**
 * Amendment anchors on the portal model (spec 039 design § 15, T074): an anchor is an
 * `entity_refs` row with the model screen of the state the amendment was written on and the
 * element key (written by the chat service with the amendment, which owns those rows).
 * `anchorReviewsOf` says which active anchored amendments need a person after a reconcile.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { anchorReviews, type AnchorReview } from '@pathfinder/model';

type Raw = BetterSqlite3.Database;

/** The active anchored amendments of the portal that need a person, by the latest model version. */
export function anchorReviewsOf(raw: Raw, portal: string): AnchorReview[] {
  const anchors = raw
    .prepare(
      `SELECT a.id, r.screen_id AS screenId, r.element_key AS elementKey
       FROM amendments a JOIN entity_refs r ON r.id = a.ref_id
       WHERE a.portal_id = ? AND a.status = 'active' AND r.screen_id IS NOT NULL ORDER BY a.key`,
    )
    .all(portal) as { id: string; screenId: string; elementKey: string | null }[];
  if (anchors.length === 0) return [];
  const version = raw
    .prepare('SELECT id FROM model_versions WHERE portal_id = ? ORDER BY seq DESC LIMIT 1')
    .get(portal) as { id: string } | undefined;
  if (!version) return [];
  const lineage = raw
    .prepare(
      `SELECT from_screen_id AS f, to_screen_id AS t, kind FROM screen_lineage
       WHERE model_version_id = ? AND kind IN ('split', 'merge', 'retire')`,
    )
    .all(version.id) as { f: string; t: string | null; kind: 'split' | 'merge' | 'retire' }[];
  const actions = new Map<string, string[]>();
  for (const a of raw
    .prepare(
      `SELECT a.screen_id || '|' || a.element_key AS k, a.status FROM action_classes a
       JOIN model_screens s ON s.id = a.screen_id WHERE s.portal_id = ?`,
    )
    .all(portal) as { k: string; status: string }[])
    actions.set(a.k, [...(actions.get(a.k) ?? []), a.status]);
  const screenKey = new Map(
    (
      raw.prepare('SELECT id, key FROM model_screens WHERE portal_id = ?').all(portal) as {
        id: string;
        key: string;
      }[]
    ).map((s) => [s.id, s.key]),
  );
  return anchorReviews(anchors, {
    screenKey,
    lineage: new Map(lineage.map((l) => [l.f, { kind: l.kind, to: l.t }])),
    actions,
  });
}
