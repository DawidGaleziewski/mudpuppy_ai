/**
 * How two clusterings of the same states differ (spec 039 T113, `pnpm model:compare-fingerprints`):
 * which screens of the first one profile would merge into one under the second, and which would
 * split. Pure; clusters are lists of state ids, order does not matter.
 */
import { compare } from './clustering.js';

export interface PartitionDifference {
  /** Clusters of `b` that join two or more clusters of `a`: each as the `a` clusters it joins. */
  merged: string[][][];
  /** Clusters of `a` whose states fall into two or more clusters of `b`: each as those parts. */
  split: string[][][];
  /** Clusters both agree on. */
  same: number;
}

const sorted = (c: readonly string[]): string[] => [...c].sort(compare);
const byFirst = (x: readonly string[], y: readonly string[]) => compare(x[0] ?? '', y[0] ?? '');

/** Groups of `from` that the states of `cluster` belong to, each cut to those states. */
function partsIn(cluster: readonly string[], owner: ReadonlyMap<string, number>): string[][] {
  const parts = new Map<number, string[]>();
  for (const s of cluster) {
    const o = owner.get(s);
    if (o !== undefined) parts.set(o, [...(parts.get(o) ?? []), s]);
  }
  return [...parts.values()].map(sorted).sort(byFirst);
}

function ownerOf(clusters: readonly (readonly string[])[]): Map<string, number> {
  const owner = new Map<string, number>();
  clusters.forEach((c, i) => c.forEach((s) => owner.set(s, i)));
  return owner;
}

/** Only states both clusterings hold are compared. */
export function comparePartitions(
  a: readonly (readonly string[])[],
  b: readonly (readonly string[])[],
): PartitionDifference {
  const inB = ownerOf(b);
  const inA = ownerOf(a);
  const merged = b
    .map((c) => partsIn(c, inA))
    .filter((parts) => parts.length > 1)
    .sort((x, y) => byFirst(x[0]!, y[0]!));
  const split = a
    .map((c) => partsIn(c, inB))
    .filter((parts) => parts.length > 1)
    .sort((x, y) => byFirst(x[0]!, y[0]!));
  const key = (c: readonly string[]) => sorted(c.filter((s) => inA.has(s) && inB.has(s))).join(',');
  const bKeys = new Set(b.map(key));
  const same = a.filter((c) => key(c) !== '' && bKeys.has(key(c))).length;
  return { merged, split, same };
}
