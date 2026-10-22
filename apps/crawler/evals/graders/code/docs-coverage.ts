/**
 * Goal score of the BA: how much of the ground truth its documentation covers, per category,
 * and how many of its claims contradict the ground truth (overclaims). The scoring itself is
 * `evaluate()` in `@mudpuppy/docs`, the same one `pnpm docs:evaluate` uses.
 */
import { evaluate, loadEvalInput, type EvalRecord, type GroundTruth } from '@mudpuppy/docs';
import type { RawDb } from '../../queries.js';

export interface Score {
  matched: number;
  total: number;
  pct: number;
}

const norm = (s: string): string => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Spec 045 (R-89, the owner's approach B kept as a diagnostic, never scored): missed rules whose
 * anchor field has a data item with a constraint, i.e. the limit was written as a constraint only.
 */
export function rulesAsConstraintsOnly(
  records: readonly EvalRecord[],
  groundTruth: GroundTruth,
  missing: readonly string[],
): number {
  const constrained = new Set(
    records
      .filter((r) => r.kind === 'data_item' && typeof r.content.name_verbatim === 'string')
      .filter((r) => Object.keys(r.content.constraints ?? {}).length > 0)
      .map((r) => norm(r.content.name_verbatim as string)),
  );
  return groundTruth.rules.filter(
    (rule) => missing.includes(rule.id) && constrained.has(norm(rule.anchor.label)),
  ).length;
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
  return {
    scores,
    overclaims: report.overclaims.length,
    handoffs: input.handoffs.length,
    rulesConstraintOnly: rulesAsConstraintsOnly(
      input.records,
      groundTruth,
      report.scores.rules.missing,
    ),
  };
}
