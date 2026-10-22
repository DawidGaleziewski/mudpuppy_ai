/**
 * Canonical clustering of concrete states into abstract states (spec 039 design § 6.1). Depends only
 * on the set of states and the constraints, never on insertion order: states are sorted by
 * fingerprint first, distances are summed in that order, and ties break on the lexically smallest
 * fingerprint of each cluster. Pure.
 */
import { MODEL_DEFAULTS } from '../defaults.js';
import {
  CLASSIFIER_THRESHOLD,
  classifierSimilarity,
  type PairComponents,
  type SimilarityClassifier,
} from './classifier.js';
import { similarity } from './minhash.js';

export interface ClusterState {
  id: string;
  /** Level-1 fingerprint: the tie-breaker. */
  fingerprint: string;
  /** Route template with identity parameters written out (design § 6.4). */
  routeKey: string;
  /** 128 MinHash values. */
  minhash: readonly number[];
  /** Every fingerprint component, for the similarity classifier (T090). */
  components?: PairComponents;
}

export interface ClusterConstraints {
  /** Pairs that must share a cluster (clone / near-duplicate labels, confirmed `same_as`). */
  mustLink: readonly (readonly [string, string])[];
  /** Pairs that must not (distinct labels, confirmed `different_from`). */
  cannotLink: readonly (readonly [string, string])[];
}

export interface Clustering {
  /** Clusters as sorted state ids, sorted by their smallest fingerprint. */
  clusters: string[][];
  /** Must-link groups that contain a cannot-link pair: kept apart until a person fixes the labels. */
  conflicts: string[][];
}

export { similarity };

/** Candidate pairs by LSH banding (design § 6.1): states sharing all rows of some band. */
export function lshCandidates(
  states: readonly ClusterState[],
  bands = MODEL_DEFAULTS.lsh.bands,
  rows = MODEL_DEFAULTS.lsh.rows,
): Set<string> {
  const pairs = new Set<string>();
  for (let b = 0; b < bands; b++) {
    const buckets = new Map<string, number[]>();
    states.forEach((s, i) => {
      const key = s.minhash.slice(b * rows, b * rows + rows).join(',');
      const list = buckets.get(key) ?? [];
      list.push(i);
      buckets.set(key, list);
    });
    for (const list of buckets.values())
      for (let x = 0; x < list.length; x++)
        for (let y = x + 1; y < list.length; y++) pairs.add(`${list[x]},${list[y]}`);
  }
  return pairs;
}

class UnionFind {
  private readonly parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]!]!;
      i = this.parent[i]!;
    }
    return i;
  }
  /** Joins toward the smaller root, so the result never depends on call order. */
  union(a: number, b: number): void {
    const [ra, rb] = [this.find(a), this.find(b)];
    if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/** Code-unit order: the same on every machine (never locale-dependent). */
export function compare(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Cluster one route partition. `states` may come in any order. */
export function clusterPartition(
  input: readonly ClusterState[],
  constraints: ClusterConstraints,
  tau: number = MODEL_DEFAULTS.tau,
  classifier?: SimilarityClassifier,
): Clustering {
  const states = [...input].sort((a, b) => compare(a.fingerprint, b.fingerprint));
  const n = states.length;
  const index = new Map(states.map((s, i) => [s.id, i]));
  const cannot = new Set(
    constraints.cannotLink
      .filter(([a, b]) => index.has(a) && index.has(b))
      .map(([a, b]) => pairKey(a, b)),
  );

  const { clusters: groups, conflicts } = mustLinkGroups(states, index, constraints, cannot);

  // Pairwise distances: LSH candidates in large partitions, every pair otherwise (others count 1).
  const candidates = n > MODEL_DEFAULTS.lshAbove ? lshCandidates(states) : null;
  const dist = (i: number, j: number): number => {
    const [x, y] = i < j ? [i, j] : [j, i];
    if (candidates && !candidates.has(`${x},${y}`)) return 1;
    const [a, b] = [states[x]!, states[y]!];
    // T090: a classifier the portal switched on scores the pair over all its components.
    if (classifier && a.components && b.components)
      return 1 - classifierSimilarity(classifier, a.components, b.components);
    return 1 - similarity(a.minhash, b.minhash);
  };
  const blocked = (a: number[], b: number[]): boolean =>
    a.some((i) => b.some((j) => cannot.has(pairKey(states[i]!.id, states[j]!.id))));
  const average = (a: number[], b: number[]): number => {
    let sum = 0;
    for (const i of a) for (const j of b) sum += dist(i, j);
    return sum / (a.length * b.length);
  };
  const limit = 1 - (classifier ? CLASSIFIER_THRESHOLD : tau) + 1e-12;
  const clusters = agglomerate(groups, { average, blocked, limit });
  return {
    clusters: clusters.map((c) => c.map((i) => states[i]!.id).sort()),
    conflicts,
  };
}

/** Must-link groups first; a group holding a cannot-link pair is a label conflict and stays apart. */
function mustLinkGroups(
  states: readonly ClusterState[],
  index: ReadonlyMap<string, number>,
  constraints: ClusterConstraints,
  cannot: ReadonlySet<string>,
): { clusters: number[][]; conflicts: string[][] } {
  const uf = new UnionFind(states.length);
  for (const [a, b] of constraints.mustLink) {
    const [ia, ib] = [index.get(a), index.get(b)];
    if (ia !== undefined && ib !== undefined) uf.union(ia, ib);
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < states.length; i++) {
    const r = uf.find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  }
  const conflicts: string[][] = [];
  const clusters: number[][] = [];
  for (const members of [...groups.values()].sort((a, b) => a[0]! - b[0]!)) {
    const ids = members.map((i) => states[i]!.id);
    const conflicted = ids.some((a, x) => ids.slice(x + 1).some((b) => cannot.has(pairKey(a, b))));
    if (conflicted && members.length > 1) {
      conflicts.push([...ids].sort());
      clusters.push(...members.map((i) => [i]));
    } else clusters.push(members);
  }
  return { clusters, conflicts };
}

interface Linkage {
  average: (a: number[], b: number[]) => number;
  blocked: (a: number[], b: number[]) => boolean;
  limit: number;
}

/** Average-linkage merging until no pair is close enough (members as state indexes). */
function agglomerate(start: number[][], { average, blocked, limit }: Linkage): number[][] {
  let clusters = start;
  // Clusters keep their members sorted, so a cluster's first member holds its smallest fingerprint.
  for (;;) {
    let best: { a: number; b: number; d: number } | null = null;
    for (let a = 0; a < clusters.length; a++)
      for (let b = a + 1; b < clusters.length; b++) {
        const d = average(clusters[a]!, clusters[b]!);
        if (d > limit || blocked(clusters[a]!, clusters[b]!)) continue;
        // `clusters` is ordered by smallest fingerprint, so the first pair found at a distance is
        // the lexically smallest one: ties need no further check.
        if (best === null || d < best.d - 1e-12) best = { a, b, d };
      }
    if (best === null) break;
    const merged = [...clusters[best.a]!, ...clusters[best.b]!].sort((x, y) => x - y);
    clusters = clusters.filter((_, i) => i !== best.a && i !== best.b);
    clusters.push(merged);
    clusters.sort((x, y) => x[0]! - y[0]!);
  }
  return clusters;
}

/** Cluster every route partition of a portal; clusters never cross route keys. */
export function clusterPortal(
  states: readonly ClusterState[],
  constraints: ClusterConstraints,
  tau: number = MODEL_DEFAULTS.tau,
  classifier?: SimilarityClassifier,
): Clustering {
  const byRoute = new Map<string, ClusterState[]>();
  for (const s of states) byRoute.set(s.routeKey, [...(byRoute.get(s.routeKey) ?? []), s]);
  const out: Clustering = { clusters: [], conflicts: [] };
  for (const route of [...byRoute.keys()].sort()) {
    const r = clusterPartition(byRoute.get(route)!, constraints, tau, classifier);
    out.clusters.push(...r.clusters);
    out.conflicts.push(...r.conflicts);
  }
  return out;
}
