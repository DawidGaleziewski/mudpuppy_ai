import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EvalResult } from '@pathfinder/gates';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseConfig, type EvalConfig } from '../config.js';
import { saveResult } from '../results.js';

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
