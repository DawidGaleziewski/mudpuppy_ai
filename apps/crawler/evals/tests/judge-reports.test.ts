import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { defineJudge, judgeVersion } from '../graders/model/definition.js';
import {
  hasTestReport,
  isCalibrated,
  readReports,
  saveReport,
  type CalibrationReport,
} from '../graders/model/reports.js';

const judge = defineJudge({
  id: 'glossary-terms',
  category: 'terms',
  question: 'Same term?',
  pass: 'Same.',
  fail: 'Not the same.',
  examples: [],
  selectPairs: () => [],
});

const report = (over: Partial<CalibrationReport>): CalibrationReport => ({
  judge: judge.id,
  version: judgeVersion(judge),
  model: 'claude-sonnet-5-5',
  claude_code_version: '2.1.288',
  split: 'test',
  at: '2026-10-11T01:00:00.000Z',
  runs: 3,
  table: { tp: 9, fn: 1, fp: 0, tn: 10 },
  tpr: 0.9,
  tnr: 1,
  flip_rate: 0,
  skipped: [],
  disagreements: [],
  repeat_test_use: false,
  cost: { usd: 0.3, input_tokens: 60000, output_tokens: 7000, calls: 60 },
  ...over,
});

it('saves reports and reads them back oldest first, ignoring other files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reports-'));
  saveReport(dir, report({ split: 'dev', at: '2026-10-11T02:00:00.000Z' }));
  saveReport(dir, report({ at: '2026-10-11T01:00:00.000Z' }));
  writeFileSync(join(dir, '2026-10-11T03-00-00-000Z-store.json'), '{"other":true}');
  expect(readReports(dir).map((r) => r.split)).toEqual(['test', 'dev']);
});

it('is calibrated by the newest test report of the current wording only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reports-'));
  expect(isCalibrated(judge, dir)).toBe(false);
  expect(hasTestReport(judge, dir)).toBe(false);
  saveReport(dir, report({ split: 'dev' }));
  expect(isCalibrated(judge, dir)).toBe(false);
  saveReport(dir, report({}));
  expect(isCalibrated(judge, dir)).toBe(true);
  // A newer test run below the bar wins.
  saveReport(dir, report({ at: '2026-10-11T05:00:00.000Z', tnr: 0.85 }));
  expect(isCalibrated(judge, dir)).toBe(false);
  // Reworded: no test report for the new version yet.
  const reworded = { ...judge, question: 'Same portal term?' };
  expect(hasTestReport(reworded, dir)).toBe(false);
  expect(isCalibrated(reworded, dir)).toBe(false);
});
