/**
 * Goal score of the BA: how much of the ground truth its documentation covers, per category,
 * and how many of its claims contradict the ground truth (overclaims). The scoring itself is
 * `evaluate()` in `@pathfinder/docs`, the same one `pnpm docs:evaluate` uses.
 */
import { evaluate, loadEvalInput, type GroundTruth } from '@pathfinder/docs';
import type { RawDb } from '../queries.js';

export interface Score {
  matched: number;
  total: number;
  pct: number;
}

export function scoreDocs(db: RawDb, portal: string, groundTruth: GroundTruth) {
  const input = loadEvalInput(db, portal);
  const report = evaluate({ portal_id: portal, ...input, groundTruth });
  const scores: Record<string, Score> = Object.fromEntries(
    Object.entries(report.scores).map(([k, s]) => [
      k,
      { matched: s.matched, total: s.total, pct: s.pct },
    ]),
  );
  return { scores, overclaims: report.overclaims.length, handoffs: input.handoffs.length };
}
