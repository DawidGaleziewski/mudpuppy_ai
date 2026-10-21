/**
 * Stable screen ids across re-clustering, and the lineage of splits, merges, retirements and
 * revivals (spec 039 design § 6.2). New clusters are matched to existing screens by shared members,
 * greedily, largest overlap first; ties prefer the screen with more anchored doc records, then the
 * smaller id. Pure.
 */
import { compare } from './clustering.js';

export interface ExistingScreen {
  id: string;
  /** Current member state ids. */
  members: readonly string[];
  /** Doc records anchored to it (ties prefer the more documented screen). */
  anchoredDocs: number;
  status: 'active' | 'merged' | 'retired';
}

export type LineageKind = 'split' | 'merge' | 'retire' | 'revive';

export interface Lineage {
  kind: LineageKind;
  from: string;
  /** The screen members went to; null for a retirement. */
  to: string | null;
  membersMoved: number;
}

export interface ScreenAssignment {
  /** Cluster index → existing screen id, or null for a new screen. */
  screenOf: (string | null)[];
  lineage: Lineage[];
}

/**
 * Match `clusters` (sorted state ids each) to `screens`. A cluster with no partner becomes a new
 * screen (null); the caller names it, then calls `lineageFor` with the final ids.
 */
export function assignScreens(
  clusters: readonly (readonly string[])[],
  screens: readonly ExistingScreen[],
): (string | null)[] {
  const memberOf = new Map<string, string>();
  for (const s of screens) for (const m of s.members) memberOf.set(m, s.id);
  const byId = new Map(screens.map((s) => [s.id, s]));
  const candidates: { cluster: number; screen: string; overlap: number }[] = [];
  clusters.forEach((members, cluster) => {
    const counts = new Map<string, number>();
    for (const m of members) {
      const s = memberOf.get(m);
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    for (const [screen, overlap] of counts) candidates.push({ cluster, screen, overlap });
  });
  candidates.sort(
    (a, b) =>
      b.overlap - a.overlap ||
      byId.get(b.screen)!.anchoredDocs - byId.get(a.screen)!.anchoredDocs ||
      compare(a.screen, b.screen) ||
      compare(clusters[a.cluster]![0]!, clusters[b.cluster]![0]!),
  );
  const screenOf: (string | null)[] = clusters.map(() => null);
  const used = new Set<string>();
  for (const c of candidates) {
    if (screenOf[c.cluster] !== null || used.has(c.screen)) continue;
    screenOf[c.cluster] = c.screen;
    used.add(c.screen);
  }
  return screenOf;
}

/**
 * Lineage of one re-clustering, once every cluster has its final screen id: a screen left without
 * a cluster is merged into the screen that took most of its members (retired if none took any); a
 * screen whose members went to several clusters keeps its own and records a split per other one; a
 * retired or merged screen that gets a cluster again is revived.
 */
export function lineageFor(
  clusters: readonly (readonly string[])[],
  finalIds: readonly string[],
  screens: readonly ExistingScreen[],
): Lineage[] {
  const screenOfState = new Map<string, string>();
  clusters.forEach((members, i) => {
    for (const m of members) screenOfState.set(m, finalIds[i]!);
  });
  const kept = new Set(finalIds);
  const out: Lineage[] = [];
  for (const s of [...screens].sort((a, b) => compare(a.id, b.id))) {
    const moved = new Map<string, number>();
    for (const m of s.members) {
      const to = screenOfState.get(m);
      if (to !== undefined && to !== s.id) moved.set(to, (moved.get(to) ?? 0) + 1);
    }
    const targets = [...moved.entries()].sort((a, b) => b[1] - a[1] || compare(a[0], b[0]));
    if (kept.has(s.id)) {
      if (s.status !== 'active')
        out.push({ kind: 'revive', from: s.id, to: s.id, membersMoved: 0 });
      for (const [to, n] of targets) out.push({ kind: 'split', from: s.id, to, membersMoved: n });
    } else if (s.status === 'active') {
      const top = targets[0];
      out.push(
        top
          ? { kind: 'merge', from: s.id, to: top[0], membersMoved: top[1] }
          : { kind: 'retire', from: s.id, to: null, membersMoved: 0 },
      );
    }
  }
  return out;
}
