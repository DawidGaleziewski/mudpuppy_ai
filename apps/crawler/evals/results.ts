/**
 * The results log under `data/evals/<portal>/`, one JSON file per trial: write this trial's
 * result, compare it with the baseline (within `tolerances.json`), and on `--promote` make it the
 * new baseline.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  compareEval,
  comparisonMarkdown,
  EvalResult,
  HARD_ZERO_CHECKS,
  Tolerances,
  type JudgeRunResult,
} from '@pathfinder/gates';
import type { EvalConfig } from './config.js';
import type { Cost, ScoredOutcome } from './harness/index.js';
import type { Grades } from './graders/index.js';

/** What one trial produced, before it becomes an `EvalResult`. */
export interface TrialRecord {
  startedAt: string;
  crawlRunId: string;
  /** `ba` is null in a crawler-only trial; `baTraces` is null when no trace session ran (F-12). */
  sessions: { crawler: string; ba: string | null; baTraces: string | null };
  /** The process traces run after the map, in order; empty when none ran (spec 025 FR-006). */
  processTraces: { process_id: string; run: string; cli_session: string }[];
  /** How each agent's session ended; `ba` is absent in a crawler-only trial (spec 020 T003). */
  outcomes: {
    crawler: ScoredOutcome;
    ba?: ScoredOutcome;
    ba_traces?: ScoredOutcome;
    process_traces?: ScoredOutcome[];
  };
  cost: Cost;
  grades: Grades;
  /** The workspace the agents ran in; absent with `--in-place` (spec 017 F-01). */
  workspace?: string;
  /** Model-based graders; absent when off or when none applied (spec 017). */
  judges?: JudgeRunResult[];
}

/** What makes trials comparable; absent when everything is default, as in older results. */
function conditionsOf(config: EvalConfig, processTraces: number) {
  const c = {
    ...(config.sessionTimeoutS !== undefined && { session_timeout_s: config.sessionTimeoutS }),
    ...(config.crawlerOnly && { crawler_only: true }),
    ...(processTraces > 0 && { process_traces: processTraces }),
  };
  return Object.keys(c).length > 0 ? { conditions: c } : {};
}

export function buildResult(config: EvalConfig, r: TrialRecord): EvalResult {
  return EvalResult.parse({
    portal_id: config.portal,
    persona_id: config.persona,
    started_at: r.startedAt,
    git_sha: execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: config.root,
      encoding: 'utf8',
    }).trim(),
    runs: {
      crawler: r.crawlRunId,
      ba_session: r.grades.session?.id ?? null,
      crawler_cli_session: r.sessions.crawler,
      ba_cli_session: r.sessions.ba,
      ...(r.grades.tracesSession && { ba_traces_session: r.grades.tracesSession.id }),
      ...(r.sessions.baTraces && { ba_traces_cli_session: r.sessions.baTraces }),
      ...(r.processTraces.length > 0 && { process_traces: r.processTraces }),
    },
    ...conditionsOf(config, r.processTraces.length),
    outcomes: r.outcomes,
    cost: r.cost,
    scores: r.grades.scores,
    overclaims: r.grades.overclaims,
    checks: r.grades.checks,
    ...(r.workspace && { workspace: r.workspace }),
    ...(r.judges && r.judges.length > 0 && { judges: r.judges }),
  });
}

const fileStamp = (iso: string) => iso.replace(/[:.]/g, '-');
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path: string, value: unknown) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

type Conditions = EvalResult['conditions'];

/** Each condition: its value with the default filled in, and the warning when the two differ. */
const CONDITION_CHECKS: {
  value: (c: Conditions) => unknown;
  warning: (was: Conditions, now: Conditions) => string;
}[] = [
  {
    value: (c) => c?.session_timeout_s,
    warning: (was, now) =>
      `the baseline ran with session timeout ${was?.session_timeout_s ?? 'default'}, this eval with ${now?.session_timeout_s ?? 'default'}`,
  },
  {
    value: (c) => !!c?.crawler_only,
    warning: () => 'one of the baseline and this eval ran crawler-only, the other with the BA',
  },
  {
    value: (c) => c?.process_traces ?? 0,
    warning: (was, now) =>
      `the baseline ran ${was?.process_traces ?? 0} process trace(s), this eval ${now?.process_traces ?? 0}`,
  },
];

/** The trial ran under different conditions than the baseline, so the comparison may mislead. */
function warnIfNotComparable(baseline: EvalResult, result: EvalResult): void {
  const was = baseline.conditions;
  const now = result.conditions;
  for (const check of CONDITION_CHECKS)
    if (check.value(was) !== check.value(now))
      console.warn(`warning: ${check.warning(was, now)}: not comparable`);
}

/** Save, compare and print; returns the exit code: 1 on a regression, else 0. */
export function saveResult(config: EvalConfig, result: EvalResult): number {
  const dir = config.resultsDir;
  mkdirSync(join(dir, 'history'), { recursive: true });
  const file = join(dir, `${fileStamp(result.started_at)}.json`);
  writeJson(file, result);
  const basePath = join(dir, 'baseline.json');
  const baseline = existsSync(basePath) ? EvalResult.parse(readJson(basePath)) : null;
  const tolPath = join(dir, 'tolerances.json');
  const tolerances = existsSync(tolPath) ? Tolerances.parse(readJson(tolPath)) : {};
  if (baseline) warnIfNotComparable(baseline, result);
  const cmp = compareEval(result, baseline, tolerances);
  process.stdout.write(comparisonMarkdown(result, cmp));
  console.log(`\nresult: ${file}`);
  if (config.promote) promote(config, result, baseline, cmp.regressions);
  return cmp.regressions.length > 0 ? 1 : 0;
}

/** Replace the baseline, keeping the old one in history/; never a run that broke a hard check. */
function promote(
  config: EvalConfig,
  result: EvalResult,
  baseline: EvalResult | null,
  regressions: string[],
): void {
  const hard = regressions.filter((r) =>
    (HARD_ZERO_CHECKS as readonly string[]).some((c) => r === `check:${c}`),
  );
  if (result.checks.crawler_completed !== true && !config.forcePromote)
    return console.log(
      'not promoted: the crawler run did not complete (budget?); raise --budget-usd or pass --force-promote',
    );
  if (hard.length > 0) return console.log(`not promoted: ${hard.join(', ')} above 0`);
  const basePath = join(config.resultsDir, 'baseline.json');
  if (baseline)
    renameSync(
      basePath,
      join(config.resultsDir, 'history', `${fileStamp(baseline.started_at)}.json`),
    );
  writeJson(basePath, result);
  console.log(`promoted to ${basePath}`);
}
