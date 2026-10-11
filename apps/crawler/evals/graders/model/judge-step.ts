/**
 * The judges over one store (spec 017 US1, FR-006): after the code graders of a trial, and for
 * `pnpm eval:judge` on an existing store. Each judge whose category has ground-truth items asks
 * about its pairs once; the result is reported beside the code scores, never inside them.
 */
import type { GroundTruth } from '@pathfinder/docs';
import type { JudgeRunResult } from '@pathfinder/gates';
import { judgeVersion, type JudgeDefinition, type Pair } from './definition.js';
import type { JudgeLogin } from './login.js';
import { isCalibrated, judgeReportsDir } from './reports.js';
import { runJudge } from './run.js';
import { summarise } from './score.js';
import { pairsFromStore } from './store-pairs.js';

/** Pairs per ground-truth item at most; the rest are counted, not asked (edge case: many candidates). */
export const MAX_PAIRS_PER_ITEM = 10;

export interface StoreJudgeInput {
  root: string;
  storePath: string;
  portal: string;
  groundTruth: GroundTruth;
  judges: readonly JudgeDefinition[];
  login: JudgeLogin;
}

export interface StoreJudgeOutput {
  result: JudgeRunResult;
  pairs: Pair[];
}

function capPerItem(pairs: readonly Pair[]): { kept: Pair[]; skipped: number } {
  const seen = new Map<string, number>();
  const kept = pairs.filter((p) => {
    const n = (seen.get(p.itemId) ?? 0) + 1;
    seen.set(p.itemId, n);
    return n <= MAX_PAIRS_PER_ITEM;
  });
  return { kept, skipped: pairs.length - kept.length };
}

async function judgeOne(def: JudgeDefinition, i: StoreJudgeInput): Promise<StoreJudgeOutput> {
  const found = await pairsFromStore(def, i.storePath, i.portal, i.groundTruth);
  const { kept, skipped } = capPerItem(found.pairs);
  const out = await runJudge(def, kept, { login: i.login });
  const verdicts = out.runs[0] ?? [];
  const score = summarise(found.itemIds, kept, verdicts);
  return {
    pairs: kept,
    result: {
      id: def.id,
      version: judgeVersion(def),
      model: out.model,
      claude_code_version: out.claudeCodeVersion,
      calibrated: isCalibrated(def, judgeReportsDir(i.root, def.id)),
      ...score,
      skipped_pairs: skipped,
      cost: out.cost,
      verdicts: verdicts.map((v) => ({ pair_id: v.pairId, verdict: v.verdict, reason: v.reason })),
    },
  };
}

/** Judges with nothing to judge in this ground truth are left out. Throws `JudgeSetupError`. */
export async function judgeStore(i: StoreJudgeInput): Promise<StoreJudgeOutput[]> {
  const out: StoreJudgeOutput[] = [];
  for (const def of i.judges) {
    const items: unknown = i.groundTruth[def.category];
    if (!Array.isArray(items) || items.length === 0) continue;
    out.push(await judgeOne(def, i));
  }
  return out;
}

export function judgeLine(j: JudgeRunResult): string {
  return (
    `judge ${j.id} (v${j.version}, ${j.calibrated ? 'calibrated' : 'uncalibrated'}): ` +
    `${j.covered}/${j.total} covered, pass ${j.counts.pass} · fail ${j.counts.fail} · ` +
    `unknown ${j.counts.unknown} · error ${j.counts.error}` +
    `${j.skipped_pairs > 0 ? ` (${j.skipped_pairs} pairs over the cap not asked)` : ''}, ` +
    `$${j.cost.usd.toFixed(3)}`
  );
}
