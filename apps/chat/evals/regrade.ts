/**
 * `pnpm --dir apps/chat eval:regrade <result.json> <workspace>`: grade a kept trial workspace again
 * after a grader changed, and write the new scores into its result file (marked `regraded_at`).
 * The assistant does not run; the outcome is the store as the trial left it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from '@mudpuppy/store';
import { REPO_ROOT } from './config.js';
import { die } from './failures.js';
import { grade } from './graders/index.js';
import type { TrialRecord } from './results.js';
import { loadProcesses, taskFor } from './tasks.js';

const [resultFile, workspace, ...rest] = process.argv.slice(2);
if (resultFile === undefined || workspace === undefined || rest.length > 0)
  die('usage: pnpm --dir apps/chat eval:regrade <result.json> <workspace>');
const record = JSON.parse(readFileSync(resultFile, 'utf8')) as TrialRecord & { regraded_at?: string };
const task = taskFor(record.task) ?? die(`no grouping task for ${record.task}`);
// trials before `conditions.env` was recorded ran on sandbox, the eval's default
const env = (record.conditions as { env?: string }).env ?? 'sandbox';
const { raw } = openDb(join(workspace, 'data', 'db', `${env}.sqlite`));
const { grades } = grade(raw, record.task, loadProcesses(REPO_ROOT, task));
raw.close();
const updated = { ...record, ...grades, workspace, regraded_at: new Date().toISOString() };
writeFileSync(resultFile, `${JSON.stringify(updated, null, 2)}\n`);
console.log(JSON.stringify({ result: resultFile, scores: grades.scores, checks: grades.checks }, null, 2));
