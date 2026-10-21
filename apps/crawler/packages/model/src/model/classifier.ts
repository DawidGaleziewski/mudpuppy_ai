/**
 * The similarity classifier (spec 039 FR-050, plan M6, T090): instead of one threshold on MinHash
 * similarity, a logistic regression over every fingerprint component of a pair says how likely
 * the two pages are one screen. The miner trains it on the pair labels and holds some out; it is
 * used for a portal only when it detects distinct pairs better than the calibrated τ. Pure.
 */
import { similarity } from './minhash.js';

/** The components of one state a pair feature compares. */
export interface PairComponents {
  minhash: readonly number[];
  structureHash: string;
  elementKeys: readonly string[];
  /** Content, overlay, calls and mounts hashes, when known. */
  hashes?: { content: string; overlay: string; calls: string; mounts: string };
}

/** Feature names in vector order; the miner's `names` must equal them. */
export const PAIR_FEATURES = [
  'minhash',
  'structure',
  'content',
  'overlay',
  'calls',
  'mounts',
  'elements',
] as const;

const same = (a: string | undefined, b: string | undefined): number =>
  a !== undefined && a === b ? 1 : 0;

function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const sa = new Set(a);
  const sb = new Set(b);
  let both = 0;
  for (const k of sa) if (sb.has(k)) both += 1;
  return both / (sa.size + sb.size - both);
}

/** The feature vector of a pair, in `PAIR_FEATURES` order. */
export function pairFeatures(a: PairComponents, b: PairComponents): number[] {
  return [
    similarity(a.minhash, b.minhash),
    same(a.structureHash, b.structureHash),
    same(a.hashes?.content, b.hashes?.content),
    same(a.hashes?.overlay, b.hashes?.overlay),
    same(a.hashes?.calls, b.hashes?.calls),
    same(a.hashes?.mounts, b.hashes?.mounts),
    jaccard(a.elementKeys, b.elementKeys),
  ];
}

/** A trained classifier: weights in `PAIR_FEATURES` order and the intercept. */
export interface SimilarityClassifier {
  weights: readonly number[];
  intercept: number;
}

/** How likely the pair is one screen (0..1): the classifier's similarity. */
export function classifierSimilarity(
  c: SimilarityClassifier,
  a: PairComponents,
  b: PairComponents,
): number {
  const x = pairFeatures(a, b);
  const z = x.reduce((sum, v, i) => sum + v * (c.weights[i] ?? 0), c.intercept);
  return 1 / (1 + Math.exp(-z));
}

/** The similarity at or above which the classifier says "one screen". */
export const CLASSIFIER_THRESHOLD = 0.5;
