// What `pnpm model:replay` runs (spec 039 design § 9, § 11.6): the portal's waiting replays on the
// headless driver within one budget. Rule R1's error replays first (each failing step twice), then
// R8's (the failing regression test of a rule mismatch, once), then the queued tests: boundary
// tests of new rules and regression rounds of confirmed ones (a release on the decision screen
// queues one; `regress` queues one for every confirmed rule). A regression that fails becomes a
// rule mismatch, and R8 replays it in the same call while the budget lasts. Every finished replay
// run reconciles the model (complete-run), so the verdicts read named screens.

import { MODEL_DEFAULTS } from '@pathfinder/model';
import {
  type OpenedDb,
  judgeReplays,
  pendingErrorReplays,
  pendingMismatchReplays,
  pendingReplays,
  queueRegressions,
  recordReplay,
  recordRuleMismatches,
  replayStepResult,
  resolveErrorReplays,
  resolveRuleMismatch,
} from '@pathfinder/store';
import type { ToolCall } from './local-client.js';
import { replay } from './replay-driver.js';

type Raw = OpenedDb['raw'];

export interface ReplayPortalReport {
  /** Probe runs started (one replay each). */
  replays: number;
  /** R1: deviation → the hypothesis written (null while it keeps waiting). */
  errors: { deviationId: string; results: (string | null)[]; hypothesis: string | null }[];
  /** Rules whose regression suite was queued. */
  regressions: string[];
  /** R8: rule mismatch → the hypothesis written (decision drift or flaky). */
  mismatches: { deviationId: string; hypothesis: string | null }[];
  /** Boundary and regression tests replayed, and the rules that moved. */
  tests: number;
  moves: { hypothesis: string; to: string }[];
}

export interface ReplayPortalOptions {
  limit?: number;
  today?: string;
  /** Queue a regression round for every confirmed rule (`pnpm model:regress`). */
  regress?: boolean;
}

async function runErrors(
  call: ToolCall,
  raw: Raw,
  portal: string,
  r: ReplayPortalReport,
  budget: number,
) {
  for (const e of pendingErrorReplays(raw, portal, { limit: budget - r.replays })) {
    const results: (string | null)[] = [];
    for (let i = 0; i < e.repeats; i++) {
      results.push(replayStepResult(raw, await replay(call, e.plan)));
      r.replays += 1;
    }
    const hypothesis = resolveErrorReplays(raw, portal, e.deviationId, results);
    r.errors.push({ deviationId: e.deviationId, results, hypothesis });
  }
}

async function runMismatches(
  call: ToolCall,
  raw: Raw,
  portal: string,
  r: ReplayPortalReport,
  opts: { budget: number; today?: string },
) {
  const left = opts.budget - r.replays;
  if (left <= 0) return;
  const plans = pendingMismatchReplays(raw, portal, {
    limit: left,
    ...(opts.today ? { today: opts.today } : {}),
  });
  for (const m of plans) {
    const outcome = await replay(call, m.plan);
    r.replays += 1;
    const seen =
      outcome.status === 'reached'
        ? { state_id: outcome.stateId, transition_id: outcome.transitionId }
        : null;
    r.mismatches.push({
      deviationId: m.deviationId,
      hypothesis: resolveRuleMismatch(raw, portal, m.deviationId, seen),
    });
  }
}

export async function replayPortal(
  call: ToolCall,
  raw: Raw,
  portal: string,
  opts: ReplayPortalOptions = {},
): Promise<ReplayPortalReport> {
  const budget = opts.limit ?? MODEL_DEFAULTS.replayBudget;
  const today = opts.today ? { today: opts.today } : {};
  const r: ReplayPortalReport = {
    replays: 0,
    errors: [],
    regressions: [],
    mismatches: [],
    tests: 0,
    moves: [],
  };
  await runErrors(call, raw, portal, r, budget);
  await runMismatches(call, raw, portal, r, { budget, ...today });
  r.regressions = queueRegressions(raw, portal, { all: opts.regress === true });
  const left = budget - r.replays;
  if (left <= 0) return r;
  for (const plan of pendingReplays(raw, portal, { limit: left, ...today })) {
    recordReplay(raw, plan.testId, await replay(call, plan));
    r.replays += 1;
    r.tests += 1;
  }
  r.moves = judgeReplays(raw, portal);
  recordRuleMismatches(raw, portal);
  await runMismatches(call, raw, portal, r, { budget, ...today });
  return r;
}
