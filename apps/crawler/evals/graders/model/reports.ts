/**
 * Calibration reports (spec 017 data-model, FR-010, FR-011): one JSON file per calibration run
 * under `data/evals/judges/<judge>/<timestamp>-<split>.json`, and the rule for "calibrated":
 * the newest `test` report for the judge's current wording meets the bar on both rates.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JudgeCost } from '@mudpuppy/gates';
import { z } from 'zod';
import { meetsBar } from './calibration.js';
import { judgeVersion, type JudgeDefinition } from './definition.js';

export const CalibrationReport = z
  .object({
    judge: z.string(),
    version: z.string(),
    model: z.string(),
    claude_code_version: z.string(),
    split: z.enum(['dev', 'test']),
    at: z.string(),
    runs: z.number().int().positive(),
    table: z.object({ tp: z.number(), fn: z.number(), fp: z.number(), tn: z.number() }).strict(),
    tpr: z.number().nullable(),
    tnr: z.number().nullable(),
    flip_rate: z.number(),
    skipped: z.array(z.string()),
    disagreements: z.array(
      z
        .object({
          pair_id: z.string(),
          label: z.enum(['pass', 'fail']),
          why: z.string(),
          majority: z.enum(['pass', 'fail']),
          reasons: z.array(z.string()),
        })
        .strict(),
    ),
    repeat_test_use: z.boolean(),
    cost: JudgeCost,
  })
  .strict();
export type CalibrationReport = z.infer<typeof CalibrationReport>;

export const judgeReportsDir = (root: string, judge: string) =>
  join(root, 'data', 'evals', 'judges', judge);

const stamp = (iso: string) => iso.replace(/[:.]/g, '-');

export function saveReport(dir: string, report: CalibrationReport): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${stamp(report.at)}-${report.split}.json`);
  writeFileSync(path, `${JSON.stringify(CalibrationReport.parse(report), null, 2)}\n`);
  return path;
}

/** Every calibration report of the folder, oldest first (other reports there are ignored). */
export function readReports(dir: string): CalibrationReport[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /-(dev|test)\.json$/.test(f))
    .sort()
    .flatMap((f) => {
      const parsed = CalibrationReport.safeParse(JSON.parse(readFileSync(join(dir, f), 'utf8')));
      return parsed.success ? [parsed.data] : [];
    });
}

const testReports = (def: JudgeDefinition, dir: string) =>
  readReports(dir).filter((r) => r.split === 'test' && r.version === judgeVersion(def));

export const hasTestReport = (def: JudgeDefinition, dir: string): boolean =>
  testReports(def, dir).length > 0;

/** FR-011: the newest `test` report for the current wording has TPR and TNR at the bar or above. */
export function isCalibrated(def: JudgeDefinition, dir: string): boolean {
  const latest = testReports(def, dir).at(-1);
  return latest !== undefined && meetsBar(latest);
}
