/**
 * τ calibration and the labelling queue (spec 039 design § 6.1, T037). A person labels pairs of
 * page versions as the same screen (clone, near duplicate) or distinct; once each side has
 * `labelsToCalibrate` labels, τ is the similarity threshold of the sweep with the best F1 for
 * "same screen" (ties: the higher τ, which merges less). The queue offers the unlabelled pairs
 * closest to the current τ, where a label teaches most. Pure.
 */
import { MODEL_DEFAULTS } from '../defaults.js';
import { compare } from './clustering.js';

export interface LabelledPair {
  similarity: number;
  same: boolean;
}

export interface Calibration {
  /** The calibrated τ; null until both sides have enough labels. */
  tau: number | null;
  f1: number | null;
  same: number;
  distinct: number;
  /** Labels each side needs. */
  needed: number;
}

export function calibrateTau(
  labelled: readonly LabelledPair[],
  opts: {
    labelsToCalibrate?: number;
    sweep?: { from: number; to: number; step: number };
  } = {},
): Calibration {
  const needed = opts.labelsToCalibrate ?? MODEL_DEFAULTS.labelsToCalibrate;
  const sweep = opts.sweep ?? MODEL_DEFAULTS.tauSweep;
  const same = labelled.filter((l) => l.same).length;
  const distinct = labelled.length - same;
  if (same < needed || distinct < needed) return { tau: null, f1: null, same, distinct, needed };
  let best: { tau: number; f1: number } | null = null;
  const steps = Math.round((sweep.to - sweep.from) / sweep.step);
  for (let i = 0; i <= steps; i++) {
    const tau = Math.round((sweep.from + i * sweep.step) * 1000) / 1000;
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const l of labelled) {
      const merged = l.similarity >= tau;
      if (merged && l.same) tp++;
      else if (merged) fp++;
      else if (l.same) fn++;
    }
    const f1 = tp === 0 ? 0 : (2 * tp) / (2 * tp + fp + fn);
    if (!best || f1 >= best.f1) best = { tau, f1 };
  }
  return { tau: best!.tau, f1: Math.round(best!.f1 * 1000) / 1000, same, distinct, needed };
}

export interface CandidatePair {
  a: string;
  b: string;
  similarity: number;
}

/** Unlabelled pairs within `window` of τ, the closest first (ties in id order), at most `limit`. */
export function labellingQueue(
  pairs: readonly CandidatePair[],
  tau: number,
  opts: { window?: number; limit?: number } = {},
): CandidatePair[] {
  const window = opts.window ?? MODEL_DEFAULTS.labelWindow;
  return pairs
    .filter((p) => Math.abs(p.similarity - tau) <= window)
    .sort(
      (x, y) =>
        Math.abs(x.similarity - tau) - Math.abs(y.similarity - tau) ||
        compare(x.a, y.a) ||
        compare(x.b, y.b),
    )
    .slice(0, opts.limit ?? 20);
}
