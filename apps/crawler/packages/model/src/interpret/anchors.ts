/**
 * Review triggers of anchors (spec 039 design § 15, T074): an amendment anchored on a model screen
 * and element key needs a person only when its screen was merged, split or retired (the lineage
 * row is the reason), or when every action on its element key is `not_seen_since` in the current
 * epoch. A new member of the screen (another revision of the page) never triggers a review. Pure.
 */

/** An amendment's anchor: a model screen and, optionally, an element key on it. */
export interface ModelAnchor {
  id: string;
  screenId: string;
  elementKey: string | null;
}

export interface AnchorFacts {
  /** Screen key per screen id, for the explanation. */
  screenKey: ReadonlyMap<string, string>;
  /** The latest lineage row that moved each screen away (split, merge, retire). */
  lineage: ReadonlyMap<string, { kind: 'split' | 'merge' | 'retire'; to: string | null }>;
  /** Action class statuses per `screenId|elementKey`. */
  actions: ReadonlyMap<string, readonly string[]>;
}

export interface AnchorReview {
  id: string;
  reason: 'screen_moved' | 'element_gone';
  detail: string;
}

const WORD = { split: 'was split', merge: 'was merged', retire: 'was retired' } as const;

export function anchorReviews(anchors: readonly ModelAnchor[], facts: AnchorFacts): AnchorReview[] {
  const out: AnchorReview[] = [];
  for (const a of anchors) {
    const key = facts.screenKey.get(a.screenId) ?? a.screenId;
    const moved = facts.lineage.get(a.screenId);
    if (moved) {
      const into = moved.to ? ` into ${facts.screenKey.get(moved.to) ?? moved.to}` : '';
      out.push({
        id: a.id,
        reason: 'screen_moved',
        detail: `screen ${key} ${WORD[moved.kind]}${into}`,
      });
      continue;
    }
    if (a.elementKey === null) continue;
    const statuses = facts.actions.get(`${a.screenId}|${a.elementKey}`) ?? [];
    if (statuses.length > 0 && statuses.every((s) => s === 'not_seen_since'))
      out.push({
        id: a.id,
        reason: 'element_gone',
        detail: `${a.elementKey} is no longer seen on screen ${key}`,
      });
  }
  return out;
}
