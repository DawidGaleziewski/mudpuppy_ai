// What `pnpm model:replay` runs (spec 039 design § 9): the portal's waiting replays on the headless
// driver within one budget. Rule R1's error replays come first (each failing step twice; they
// decide flaky vs deterministic), then the untested boundary tests of decision rules. Every
// finished replay run reconciles the model (complete-run), so the verdicts read named screens.

import { MODEL_DEFAULTS } from '@pathfinder/model';
import {
  type OpenedDb,
  judgeReplays,
  pendingErrorReplays,
  pendingReplays,
  recordReplay,
  replayStepResult,
  resolveErrorReplays,
} from '@pathfinder/store';
import type { ToolCall } from './local-client.js';
import { replay } from './replay-driver.js';

export interface ReplayPortalReport {
  /** Replay runs started. */
  replays: number;
  /** R1: deviation → the hypothesis written (null while it keeps waiting). */
  errors: { deviationId: string; results: (string | null)[]; hypothesis: string | null }[];
  /** Boundary tests replayed, and the rules that moved. */
  tests: number;
  moves: { hypothesis: string; to: string }[];
}

export async function replayPortal(
  call: ToolCall,
  raw: OpenedDb['raw'],
  portal: string,
  opts: { limit?: number; today?: string } = {},
): Promise<ReplayPortalReport> {
  const budget = opts.limit ?? MODEL_DEFAULTS.replayBudget;
  const report: ReplayPortalReport = { replays: 0, errors: [], tests: 0, moves: [] };
  for (const e of pendingErrorReplays(raw, portal, { limit: budget })) {
    const results: (string | null)[] = [];
    for (let i = 0; i < e.repeats; i++) {
      const outcome = await replay(call, e.plan);
      report.replays += 1;
      results.push(replayStepResult(raw, outcome));
    }
    report.errors.push({
      deviationId: e.deviationId,
      results,
      hypothesis: resolveErrorReplays(raw, portal, e.deviationId, results),
    });
  }
  const left = budget - report.replays;
  if (left <= 0) return report;
  const plans = pendingReplays(raw, portal, {
    limit: left,
    ...(opts.today ? { today: opts.today } : {}),
  });
  for (const plan of plans) {
    recordReplay(raw, plan.testId, await replay(call, plan));
    report.replays += 1;
    report.tests += 1;
  }
  report.moves = judgeReplays(raw, portal);
  return report;
}
