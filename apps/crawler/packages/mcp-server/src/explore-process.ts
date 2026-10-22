// What `pnpm model:explore` runs (spec 039 design § 14.2, T075): one pass of the stopping rule
// over a process on the headless driver: depth 1 and depth 2 gaps, then the random walks, each a
// replay in its own probe run (every finished run reconciles the model, complete-run). A pass in
// which every gap had a replay is recorded with the deviations the model found meanwhile; with
// none, the process counts as explored on the current build epochs.

import { explorationBound } from '@mudpuppy/model';
import {
  type OpenedDb,
  buildsOf,
  currentEpochs,
  explorationPlan,
  recordExploration,
} from '@mudpuppy/store';
import type { ToolCall } from './local-client.js';
import { replay } from './replay-driver.js';

type Raw = OpenedDb['raw'];

export interface ExploreReport {
  process: string;
  replays: number;
  diverged: number;
  /** Gaps no recorded journey leads to. */
  unreachable: string[];
  newDeviations: number;
  /** The `process_explorations` row, when the pass was complete. */
  recorded: string | null;
  /** The sentence the documentation states, when the pass was complete (design § 14.2). */
  bound: string | null;
}

const deviationCount = (raw: Raw, portal: string): number =>
  (
    raw.prepare('SELECT count(*) AS n FROM deviations WHERE portal_id = ?').get(portal) as {
      n: number;
    }
  ).n;

export async function exploreProcess(
  call: ToolCall,
  raw: Raw,
  portal: string,
  processKey: string,
  opts: { walks?: number; walkLength?: number; seed?: number; limit?: number } = {},
): Promise<ExploreReport | null> {
  const plan = explorationPlan(raw, portal, processKey, opts);
  if (!plan) return null;
  const before = deviationCount(raw, portal);
  const budget = opts.limit ?? Number.POSITIVE_INFINITY;
  const report: ExploreReport = {
    process: processKey,
    replays: 0,
    diverged: 0,
    unreachable: plan.unreachable,
    newDeviations: 0,
    recorded: null,
    bound: null,
  };
  for (const r of plan.replays.slice(0, budget)) {
    const outcome = await replay(call, { portal, ...r });
    report.replays += 1;
    if (outcome.status === 'diverged') report.diverged += 1;
  }
  report.newDeviations = deviationCount(raw, portal) - before;
  const complete = report.replays === plan.replays.length && plan.unreachable.length === 0;
  if (!complete) return report;
  const pass = {
    epochs: currentEpochs(raw, portal),
    depth: 2,
    randomWalks: plan.replays.filter((r) => r.kind === 'walk').length,
    newDeviations: report.newDeviations,
  };
  report.recorded = recordExploration(raw, plan.processId, pass);
  report.bound = explorationBound({ ...pass, builds: buildsOf(raw, pass.epochs) });
  return report;
}
