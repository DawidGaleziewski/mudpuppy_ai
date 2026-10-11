import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EvalResult } from '@pathfinder/gates';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseConfig, type EvalConfig } from '../config.js';
import { buildResult, saveResult, type TrialRecord } from '../results.js';

let dir: string;
let config: EvalConfig;

const result = (startedAt: string, screensPct: number, passwordHits = 0): EvalResult => ({
  portal_id: 'reference-insurer',
  persona_id: 'guest',
  started_at: startedAt,
  git_sha: 'abc1234',
  runs: { crawler: 'run', ba_session: 'session' },
  cost: { usd: 1, input_tokens: 1, output_tokens: 1, duration_ms: 1 },
  scores: { screens: { matched: screensPct, total: 100, pct: screensPct } },
  overclaims: 0,
  checks: { crawler_completed: true, password_hits: passwordHits, widget_actions: 0 },
});
const baselineOf = () =>
  (JSON.parse(readFileSync(join(dir, 'baseline.json'), 'utf8')) as EvalResult).started_at;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pf-eval-results-'));
  const parsed = parseConfig(['reference-insurer', '--promote']);
  if (!parsed.ok) throw new Error(parsed.error);
  config = { ...parsed.config, resultsDir: dir };
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

it('writes the result, promotes the first one and keeps the old baseline in history', () => {
  expect(saveResult(config, result('2026-10-01T00:00:00.000Z', 80))).toBe(0);
  expect(existsSync(join(dir, '2026-10-01T00-00-00-000Z.json'))).toBe(true);
  expect(baselineOf()).toBe('2026-10-01T00:00:00.000Z');
  expect(saveResult(config, result('2026-10-02T00:00:00.000Z', 82))).toBe(0);
  expect(baselineOf()).toBe('2026-10-02T00:00:00.000Z');
  expect(readdirSync(join(dir, 'history'))).toEqual(['2026-10-01T00-00-00-000Z.json']);
});

it('exits 1 on a drop beyond the tolerance', () => {
  writeFileSync(join(dir, 'tolerances.json'), JSON.stringify({ screens: 5 }));
  saveResult(config, result('2026-10-01T00:00:00.000Z', 80));
  expect(saveResult({ ...config, promote: false }, result('2026-10-02T00:00:00.000Z', 76))).toBe(0);
  expect(saveResult({ ...config, promote: false }, result('2026-10-03T00:00:00.000Z', 70))).toBe(1);
});

it('never promotes a run that leaked a password', () => {
  saveResult(config, result('2026-10-01T00:00:00.000Z', 80));
  expect(saveResult(config, result('2026-10-02T00:00:00.000Z', 90, 1))).toBe(1);
  expect(baselineOf()).toBe('2026-10-01T00:00:00.000Z');
});

it('records a crawler-only trial as a condition, and no conditions when all are default', () => {
  const trial: TrialRecord = {
    startedAt: '2026-10-10T00:00:00.000Z',
    crawlRunId: 'run',
    sessions: { crawler: 'c', ba: null },
    cost: { usd: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0 },
    grades: {
      session: undefined,
      scores: { crawl_screens: { matched: 1, total: 3, pct: 33.3 } },
      overclaims: 0,
      checks: { crawler_completed: true, password_hits: 0, widget_actions: 0 },
    } as unknown as TrialRecord['grades'],
  };
  const crawlerOnly = buildResult({ ...config, crawlerOnly: true }, trial);
  expect(crawlerOnly.conditions).toEqual({ crawler_only: true });
  expect(crawlerOnly.runs).toMatchObject({ ba_session: null, ba_cli_session: null });
  expect(buildResult({ ...config, crawlerOnly: false }, trial).conditions).toBeUndefined();
});

it('records the workspace and the judges, and leaves both out when absent (spec 017)', () => {
  const trial: TrialRecord = {
    startedAt: '2026-10-11T00:00:00.000Z',
    crawlRunId: 'run',
    sessions: { crawler: 'c', ba: 'b' },
    cost: { usd: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0 },
    grades: {
      session: undefined,
      scores: { terms: { matched: 7, total: 10, pct: 70 } },
      overclaims: 0,
      checks: { crawler_completed: true, password_hits: 0, widget_actions: 0 },
    } as unknown as TrialRecord['grades'],
  };
  const judge = {
    id: 'glossary-terms',
    version: 'abc123def456',
    model: 'claude-sonnet-5-5',
    claude_code_version: '2.1.288',
    calibrated: false,
    covered: 8,
    total: 10,
    pct: 80,
    counts: { pass: 8, fail: 2, unknown: 0, error: 0 },
    skipped_pairs: 0,
    cost: { usd: 0.05, input_tokens: 9000, output_tokens: 1000, calls: 10 },
    verdicts: [],
  };
  const full = buildResult(config, { ...trial, workspace: '/tmp/pf-eval-x', judges: [judge] });
  expect(full).toMatchObject({ workspace: '/tmp/pf-eval-x', judges: [{ id: 'glossary-terms' }] });
  expect(full.scores).toEqual(trial.grades.scores);
  const bare = buildResult(config, { ...trial, judges: [] });
  expect(bare).not.toHaveProperty('workspace');
  expect(bare).not.toHaveProperty('judges');
});
