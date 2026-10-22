/**
 * `pnpm --dir apps/chat eval <portal>`: one trial of the grouping eval (spec 038 FR-002, R-78 (5)).
 * The assistant is asked, as in the chat, to cut the portal's recorded scans into processes; its
 * suggestions are graded against the ground truth. Reads top to bottom: config → task → workspace
 * → (dry run stops here) → assistant → grade → result.
 */
import { randomUUID } from 'node:crypto';
import { openDb } from '@mudpuppy/store';
import { parseConfig } from './config.js';
import { die, EvalAbort } from './failures.js';
import { grade } from './graders/index.js';
import { createWorkspace, runAssistant } from './harness/index.js';
import { regroupPrompt } from './prompts.js';
import { buildResult, saveResult } from './results.js';
import { loadProcesses, taskFor } from './tasks.js';

const parsed = parseConfig(process.argv.slice(2));
if (!parsed.ok) die(parsed.error);
const config = parsed.config;
const task = taskFor(config.portal) ?? die(`no grouping task for ${config.portal}`);
const processes = loadProcesses(config.root, task);
const startedAt = new Date().toISOString();
const ws = createWorkspace(config);

try {
  if (config.dryRun) {
    const { raw } = openDb(ws.storePath);
    const { grades } = grade(raw, config.portal, processes);
    raw.close();
    console.log(
      JSON.stringify({ dry_run: true, workspace: ws.dir, processes: processes.map((p) => p.id), empty: grades }, null, 2),
    );
  } else {
    const run = runAssistant(config, ws, regroupPrompt(config.portal), randomUUID());
    const { raw } = openDb(ws.storePath);
    const { grades, suggestions } = grade(raw, config.portal, processes);
    raw.close();
    const file = saveResult(config, buildResult(config, { startedAt, run, grades, suggestions, workspace: ws.dir }));
    console.log(JSON.stringify({ result: file, scores: grades.scores, checks: grades.checks }, null, 2));
  }
} catch (e) {
  if (e instanceof EvalAbort) die(e.message, e.code);
  throw e;
} finally {
  // A real trial's workspace stays for reading (its store is the outcome), as the crawler eval's.
  if (config.dryRun) ws.remove();
  else console.log(`workspace kept: ${ws.dir}`);
}
