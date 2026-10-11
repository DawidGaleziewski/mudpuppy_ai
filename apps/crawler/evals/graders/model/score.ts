/**
 * A judge's score over one store (spec 017 data-model JudgeRun): an item is covered when at least
 * one of its pairs passed. `unknown` and `error` never cover; an item with no candidates is in the
 * total and not covered (edge case: nothing to ask, no call made).
 */
import type { Pair } from './definition.js';

export type VerdictKind = 'pass' | 'fail' | 'unknown' | 'error';

export interface Verdict {
  pairId: string;
  verdict: VerdictKind;
  reason: string;
}

export interface JudgeScore {
  covered: number;
  total: number;
  pct: number;
  counts: Record<VerdictKind, number>;
}

/** `itemIds`: every ground-truth item of the judge's category, with or without candidates. */
export function summarise(
  itemIds: readonly string[],
  pairs: readonly Pair[],
  verdicts: readonly Verdict[],
): JudgeScore {
  const byPair = new Map(verdicts.map((v) => [v.pairId, v.verdict]));
  const coveredItems = new Set(
    pairs.filter((p) => byPair.get(p.id) === 'pass').map((p) => p.itemId),
  );
  const covered = itemIds.filter((id) => coveredItems.has(id)).length;
  const counts: Record<VerdictKind, number> = { pass: 0, fail: 0, unknown: 0, error: 0 };
  for (const v of verdicts) counts[v.verdict] += 1;
  const total = itemIds.length;
  return {
    covered,
    total,
    // create-eval skill §7: an empty denominator scores 0, never 100 % (judges with no items
    // in the ground truth are skipped before this anyway).
    pct: total === 0 ? 0 : Math.round((covered / total) * 1000) / 10,
    counts,
  };
}
