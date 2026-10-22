import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvalResult } from '@mudpuppy/gates';
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
    sessions: { crawler: 'c', ba: null, baTraces: null },
    processTraces: [],
    formProbing: null,
    outcomes: { crawler: 'budget_end' },
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
  expect(crawlerOnly.outcomes).toEqual({ crawler: 'budget_end' });
  expect(buildResult({ ...config, crawlerOnly: false }, trial).conditions).toBeUndefined();
  expect(buildResult(config, trial).runs.process_traces).toBeUndefined();
});

it('records the process traces as runs, outcomes and a condition, and warns on a baseline without (spec 025)', () => {
  const traced: TrialRecord = {
    startedAt: '2026-10-14T00:00:00.000Z',
    crawlRunId: 'run',
    sessions: { crawler: 'c', ba: 'b', baTraces: 'bt' },
    processTraces: [
      { process_id: 'P01', run: 'run-t1', cli_session: 'cli-t1' },
      { process_id: 'P02', run: 'run-t2', cli_session: 'cli-t2' },
    ],
    formProbing: null,
    outcomes: {
      crawler: 'success',
      ba: 'success',
      ba_traces: 'success',
      process_traces: ['success', 'budget_end'],
    },
    cost: { usd: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0 },
    grades: {
      session: { id: 'as-map', status: 'completed' },
      tracesSession: { id: 'as-traces', status: 'completed' },
      scores: { screens: { matched: 1, total: 1, pct: 100 } },
      overclaims: 0,
      checks: { crawler_completed: true, password_hits: 0, widget_actions: 0 },
    } as unknown as TrialRecord['grades'],
  };
  const r = buildResult(config, traced);
  expect(r.conditions).toEqual({ process_traces: 2 });
  expect(r.runs.process_traces?.map((t) => t.run)).toEqual(['run-t1', 'run-t2']);
  expect(r.outcomes?.process_traces).toEqual(['success', 'budget_end']);
  // spec 025 F-12: the BA's map session and its traces session are both recorded
  expect(r.runs).toMatchObject({
    ba_session: 'as-map',
    ba_cli_session: 'b',
    ba_traces_session: 'as-traces',
    ba_traces_cli_session: 'bt',
  });
  expect(r.outcomes?.ba_traces).toBe('success');
  writeFileSync(join(dir, 'baseline.json'), JSON.stringify(result('2026-10-13T00:00:00.000Z', 1)));
  saveResult({ ...config, promote: false }, r);
  expect(console.warn).toHaveBeenCalledWith(
    'warning: the baseline ran 0 process trace(s), this eval 2: not comparable',
  );
});

it('records the form-probing scan as a run, an outcome and a condition, and warns on a baseline without (spec 034)', () => {
  const probed: TrialRecord = {
    startedAt: '2026-10-17T00:00:00.000Z',
    crawlRunId: 'run',
    sessions: { crawler: 'c', ba: 'b', baTraces: null },
    processTraces: [],
    formProbing: { run: 'run-p', cli_session: 'cli-p' },
    outcomes: { crawler: 'success', form_probing: 'success', ba: 'success' },
    cost: { usd: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0 },
    grades: {
      session: undefined,
      scores: { export_steps: { matched: 5, total: 5, pct: 100 } },
      overclaims: 0,
      checks: { crawler_completed: true, password_hits: 0, widget_actions: 0 },
    } as unknown as TrialRecord['grades'],
  };
  const r = buildResult(config, probed);
  expect(r.conditions).toEqual({ form_probing: true });
  expect(r.runs.form_probing).toEqual({ run: 'run-p', cli_session: 'cli-p' });
  expect(r.outcomes?.form_probing).toBe('success');
  writeFileSync(join(dir, 'baseline.json'), JSON.stringify(result('2026-10-16T00:00:00.000Z', 1)));
  saveResult({ ...config, promote: false }, r);
  expect(console.warn).toHaveBeenCalledWith(
    'warning: one of the baseline and this eval ran a form-probing scan after the map, the other not: not comparable',
  );
});

it('reads a trial written before spec 039 T116 (`probe_scan`) under the new name', () => {
  const old = {
    ...result('2026-10-16T00:00:00.000Z', 1),
    runs: { crawler: 'run', ba_session: null, probe_scan: { run: 'run-p', cli_session: 'c' } },
    conditions: { probe_scan: true },
    outcomes: { crawler: 'success', probe_scan: 'success' },
  };
  const r = EvalResult.parse(old);
  expect(r.runs.form_probing).toEqual({ run: 'run-p', cli_session: 'c' });
  expect(r.conditions).toEqual({ form_probing: true });
  expect(r.outcomes?.form_probing).toBe('success');
});

it('records the workspace and the judges, and leaves both out when absent (spec 017)', () => {
  const trial: TrialRecord = {
    startedAt: '2026-10-11T00:00:00.000Z',
    crawlRunId: 'run',
    sessions: { crawler: 'c', ba: 'b', baTraces: null },
    processTraces: [],
    formProbing: null,
    outcomes: { crawler: 'success', ba: 'success' },
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
  expect(full.outcomes).toEqual({ crawler: 'success', ba: 'success' });
  const bare = buildResult(config, { ...trial, judges: [] });
  expect(bare).not.toHaveProperty('workspace');
  expect(bare).not.toHaveProperty('judges');
});
