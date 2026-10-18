/**
 * One trial's result file and its baseline (spec 038 FR-002). Own shape, not the gates'
 * `EvalResult`: that one is built around a crawl (crawl screens, trace steps, the BA's records),
 * none of which this eval measures. Same rules: committed, with the `git_sha` it ran on; a
 * baseline is a copy of the trial chosen as the standard, the old one kept in `history/`.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalConfig } from './config.js';
import type { GroupingGrades } from './graders/index.js';
import type { AgentOutcome, CliOut } from './harness/index.js';
import type { Suggestion } from './queries.js';

export interface TrialRecord {
  task: string;
  started_at: string;
  git_sha: string;
  conditions: { model: string | null; budget_usd: string; source_store: string; env: string };
  /** The kept workspace: its store is the outcome (`eval:regrade` grades it again). */
  workspace: string;
  outcome: AgentOutcome;
  cost_usd: number;
  duration_ms: number;
  turns: number;
  scores: GroupingGrades['scores'];
  checks: GroupingGrades['checks'];
  detail: GroupingGrades['detail'];
  /** What the assistant suggested, so a reader sees the cut without opening the workspace. */
  suggestions: { name: string; routes: string[]; why: string }[];
}

export function gitSha(root: string): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export interface TrialParts {
  startedAt: string;
  run: { out: CliOut; outcome: AgentOutcome };
  grades: GroupingGrades;
  suggestions: Suggestion[];
  workspace: string;
}

export function buildResult(config: EvalConfig, parts: TrialParts): TrialRecord {
  const { startedAt, run, grades, suggestions, workspace } = parts;
  return {
    task: config.portal,
    started_at: startedAt,
    git_sha: gitSha(config.root),
    conditions: {
      model: config.model ?? null,
      budget_usd: config.budgetUsd,
      source_store: config.store,
      env: config.env,
    },
    workspace,
    outcome: run.outcome,
    cost_usd: run.out.total_cost_usd ?? 0,
    duration_ms: run.out.duration_ms ?? 0,
    turns: run.out.num_turns ?? 0,
    scores: grades.scores,
    checks: grades.checks,
    detail: grades.detail,
    suggestions: suggestions.map((s) => ({
      name: s.name,
      routes: s.steps.map((x) => x.route),
      why: s.why,
    })),
  };
}

/** Write the trial as `<started at>.json`; with `--promote` also make it the baseline. */
export function saveResult(config: EvalConfig, record: TrialRecord): string {
  mkdirSync(config.resultsDir, { recursive: true });
  const file = join(config.resultsDir, `${record.started_at.replaceAll(':', '-').replace('.', '-')}.json`);
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  if (config.promote) {
    const baseline = join(config.resultsDir, 'baseline.json');
    if (existsSync(baseline)) {
      mkdirSync(join(config.resultsDir, 'history'), { recursive: true });
      copyFileSync(baseline, join(config.resultsDir, 'history', `baseline-before-${record.started_at.replaceAll(':', '-')}.json`));
    }
    copyFileSync(file, baseline);
  }
  return file;
}
