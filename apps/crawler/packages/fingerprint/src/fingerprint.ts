/**
 * Two-level state fingerprint (research §1). Pure and deterministic.
 *
 * Level 1: sha256(routeTemplate + canonical ARIA tree + open overlays) — exact identity.
 * Level 2: MinHash signature over role-path shingles — near-identical states share a cluster
 * even when level 1 differs (e.g. listing pages that differ only by item content).
 */
import { createHash } from 'node:crypto';
import { canonicalizeAria, type AriaNode } from './aria-canonical.js';

export const DEFAULT_CLUSTER_THRESHOLD = 0.9;
const SIGNATURE_SIZE = 128;

/** Roles whose accessible name is structural (kept in shingles); other names are item content. */
const NAMED_ROLES = new Set([
  'button',
  'textbox',
  'searchbox',
  'combobox',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'spinbutton',
  'tab',
  'menuitem',
  'form',
  'search',
  'navigation',
  'region',
  'complementary',
  'group',
  'dialog',
  'alertdialog',
  'main',
  'banner',
  'contentinfo',
]);

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

function shingles(nodes: readonly AriaNode[]): Set<string> {
  const out = new Set<string>();
  for (const n of nodes) {
    const base = [...n.path, n.role].join('>');
    out.add(NAMED_ROLES.has(n.role) && n.name ? `${base}|${n.name}` : base);
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

export function computeFingerprint(input: FingerprintInput): Fingerprint {
  const canonical = canonicalizeAria(input.ariaSnapshot);
  const level1 = sha256Hex(
    [input.routeTemplate, canonical.text, canonical.overlays.join('|')].join('\n--\n'),
  );
  return {
    routeTemplate: input.routeTemplate,
    level1,
    level2: minHash(shingles(canonical.nodes)),
    overlays: canonical.overlays,
  };
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
