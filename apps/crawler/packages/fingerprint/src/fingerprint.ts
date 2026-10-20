/**
 * Two-level state fingerprint (research §1). Pure and deterministic.
 *
 * Level 1: sha256(routeTemplate + canonical ARIA tree + open overlays) — exact identity.
 * Level 2: MinHash signature over role-path shingles — near-identical states share a cluster
 * even when level 1 differs (e.g. listing pages that differ only by item content).
 */
import { createHash } from 'node:crypto';
import { canonicalizeAria, type AriaNode } from './aria-canonical.js';
import {
  ROWS_V2,
  ROWS_V2_PROFILE,
  type FingerprintProfile,
  type FingerprintRules,
} from './profile.js';
import { buildTree, collapsedText, modelElementKeys } from './structure.js';

export const DEFAULT_CLUSTER_THRESHOLD = ROWS_V2.cluster_threshold;
const SIGNATURE_SIZE = 128;

export interface FingerprintInput {
  routeTemplate: string;
  /** Playwright-style ARIA snapshot text. */
  ariaSnapshot: string;
}

export interface Fingerprint {
  routeTemplate: string;
  /** Hex sha256 — exact identity. */
  level1: string;
  /** MinHash signature of the structural shingle set. */
  level2: number[];
  overlays: string[];
}

export interface FingerprintDecision {
  kind: 'merge' | 'split';
  reason: 'identical-fingerprint' | 'similar-structure' | 'new-cluster';
  fingerprint: string;
  clusterId: string;
  /** Level-1 of the compared representative (best near-miss for a split; null if none exists). */
  matchedFingerprint: string | null;
  similarity: number;
  threshold: number;
}

export interface Assignment {
  fingerprint: string;
  clusterId: string;
  decision: FingerprintDecision;
}

const sha256Hex = (s: string): string => createHash('sha256').update(s).digest('hex');

/**
 * Role-path shingles; the profile's named roles keep their name (other names are item content),
 * except inside a container whose names it ignores.
 */
function shingles(nodes: readonly AriaNode[], rules: FingerprintRules = ROWS_V2): Set<string> {
  const named = new Set(rules.named_roles);
  const ignored = new Set(rules.ignore_names_in);
  const out = new Set<string>();
  for (const n of nodes) {
    const base = [...n.path, n.role].join('>');
    const quiet = ignored.has(n.role) || n.path.some((r) => ignored.has(r));
    out.add(named.has(n.role) && n.name && !quiet ? `${base}|${n.name}` : base);
  }
  return out;
}

function mix32(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const SEEDS = Array.from({ length: SIGNATURE_SIZE }, (_, i) => mix32((i + 1) * 0x9e3779b1));

function minHash(set: ReadonlySet<string>): number[] {
  const sig = new Array<number>(SIGNATURE_SIZE).fill(0xffffffff);
  for (const s of set) {
    const base = createHash('sha256').update(s).digest().readUInt32BE(0);
    for (let i = 0; i < SIGNATURE_SIZE; i++) {
      const v = mix32(base ^ SEEDS[i]!);
      if (v < sig[i]!) sig[i] = v;
    }
  }
  return sig;
}

/**
 * Fingerprint v2 (spec 039 design § 5.4): level 1 = sha256(route template ‖ collapsed masked tree ‖
 * overlays), where runs of repeated siblings count once and without their text; level 2 = MinHash
 * over the set of role-path shingles (a set, so repeats never changed it). Both under the portal's
 * fingerprint profile (T111@039; `rows-v2` by default).
 */
export function computeFingerprint(
  input: FingerprintInput,
  profile: FingerprintProfile = ROWS_V2_PROFILE,
): Fingerprint {
  const canonical = canonicalizeAria(input.ariaSnapshot);
  const collapsed = collapsedText(buildTree(canonical.nodes), profile.rules);
  const level1 = sha256Hex(
    [input.routeTemplate, collapsed.identity, canonical.overlays.join('|')].join('\n--\n'),
  );
  return {
    routeTemplate: input.routeTemplate,
    level1,
    level2: minHash(shingles(canonical.nodes, profile.rules)),
    overlays: canonical.overlays,
  };
}

export interface ComponentsInput extends FingerprintInput {
  /** Endpoint templates requested while the page settled (`GET /api/x/:id`). */
  calls?: readonly string[];
  /** Micro-frontend scopes mounted on the page. */
  mounts?: readonly string[];
}

/** The fingerprint components stored per state (`state_components`, design § 5.4). */
export interface StateComponents {
  structureHash: string;
  contentHash: string;
  overlayHash: string;
  callsHash: string;
  mountsHash: string;
  /** 128 MinHash values over the role-path shingle set. */
  minhash: number[];
  /** Element key of every actionable element, document order. */
  elementKeys: string[];
}

const sortedHash = (xs: readonly string[] = []): string =>
  sha256Hex([...new Set(xs)].sort().join('\n'));

export function computeComponents(
  input: ComponentsInput,
  profile: FingerprintProfile = ROWS_V2_PROFILE,
): StateComponents {
  const canonical = canonicalizeAria(input.ariaSnapshot);
  const tree = buildTree(canonical.nodes);
  const collapsed = collapsedText(tree, profile.rules);
  return {
    structureHash: sha256Hex(collapsed.structure),
    contentHash: sha256Hex(collapsed.content),
    overlayHash: sha256Hex(canonical.overlays.join('|')),
    callsHash: sortedHash(input.calls),
    mountsHash: sortedHash(input.mounts),
    minhash: minHash(shingles(canonical.nodes, profile.rules)),
    elementKeys: modelElementKeys(tree).map((k) => k.key),
  };
}

/** The 128 MinHash values as the 512-byte big-endian blob `state_components.minhash` stores. */
export function minhashBlob(minhash: readonly number[]): Buffer {
  const buf = Buffer.alloc(minhash.length * 4);
  minhash.forEach((v, i) => buf.writeUInt32BE(v >>> 0, i * 4));
  return buf;
}

/** Estimated Jaccard similarity of two shingle sets from their MinHash signatures, in [0, 1]. */
export function similarity(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let same = 0;
  for (let i = 0; i < n; i++) if (a[i] === b[i]) same++;
  return same / n;
}

export interface FingerprintIndexOptions {
  /** Level-2 similarity at or above which a state joins an existing cluster. Default 0.9. */
  threshold?: number;
}

interface Cluster {
  id: string;
  representative: Fingerprint;
}

/** In-memory cluster assignment; deterministic for a given insertion order. */
export class FingerprintIndex {
  readonly threshold: number;
  private readonly clusters: Cluster[] = [];
  private readonly byLevel1 = new Map<string, Cluster>();

  constructor(options: FingerprintIndexOptions = {}) {
    this.threshold = options.threshold ?? DEFAULT_CLUSTER_THRESHOLD;
  }

  /**
   * Add a cluster known from earlier runs, so a near-identical page joins it instead of starting a
   * new one (spec 038, LO-35: an A/B variant seen by another run is the same screen). `members` are
   * the level-1 fingerprints already recorded in it. A cluster id already known is left as it is.
   */
  seed(clusterId: string, representative: Fingerprint, members: readonly string[] = []): void {
    if (this.clusters.some((c) => c.id === clusterId)) return;
    const cluster: Cluster = { id: clusterId, representative };
    this.clusters.push(cluster);
    for (const level1 of [representative.level1, ...members])
      if (!this.byLevel1.has(level1)) this.byLevel1.set(level1, cluster);
  }

  assign(fp: Fingerprint): Assignment {
    const decide = (
      cluster: Cluster,
      kind: FingerprintDecision['kind'],
      reason: FingerprintDecision['reason'],
      matched: Fingerprint | null,
      sim: number,
    ): Assignment => ({
      fingerprint: fp.level1,
      clusterId: cluster.id,
      decision: {
        kind,
        reason,
        fingerprint: fp.level1,
        clusterId: cluster.id,
        matchedFingerprint: matched?.level1 ?? null,
        similarity: sim,
        threshold: this.threshold,
      },
    });

    const exact = this.byLevel1.get(fp.level1);
    if (exact) return decide(exact, 'merge', 'identical-fingerprint', exact.representative, 1);

    let best: Cluster | null = null;
    let bestSim = 0;
    for (const c of this.clusters) {
      const s = similarity(fp.level2, c.representative.level2);
      if (best === null || s > bestSim) {
        best = c;
        bestSim = s;
      }
    }

    if (best && bestSim >= this.threshold) {
      this.byLevel1.set(fp.level1, best);
      return decide(best, 'merge', 'similar-structure', best.representative, bestSim);
    }

    const cluster: Cluster = { id: `cluster-${fp.level1.slice(0, 12)}`, representative: fp };
    this.clusters.push(cluster);
    this.byLevel1.set(fp.level1, cluster);
    return decide(cluster, 'split', 'new-cluster', best?.representative ?? null, bestSim);
  }
}
