/**
 * Tier-2 eval (spec 009 R-27, contracts/gates-evals.md; graders of spec 014 US1): one trial of
 * one task. The real crawler and BA agents run headless against the task's portal, the graders
 * score the outcome (documentation and crawl) against the portal's ground truth and check the
 * transcripts for leaked passwords, and the result is compared with the baseline.
 * Terms follow Anthropic's eval vocabulary (G-33; table in README.md).
 * Usage: see `USAGE` in config.ts. Writes data/evals/<portal>/<timestamp>.json; exit 1 on a
 * regression, 2 on bad input or preflight. Never part of `pnpm test`: it spends real tokens.
 *
 * By default the agents work in a fresh workspace (PATHFINDER_ROOT = a temp folder with copies of
 * portals/, personas/ and the migrations), so the developer's store and its documentation are
 * never touched and every eval starts from nothing. `--in-place` uses the real store instead.
 *
 * Where things are: tasks.ts (the suite: portals + ground truth), prompts.ts, harness/ (workspace, portal
 * server, agents, cost), graders/ (what is scored, by kind), results.ts (save, compare, promote).
 */
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { GroundTruth } from '@pathfinder/docs';
import { dbPathFor, openDb } from '@pathfinder/store';
import { parseConfig, type EvalConfig } from './config.js';
import { abort, die, EvalAbort } from './failures.js';
import {
  addCost,
  createWorkspace,
  emptyCost,
  ensurePortal,
  preflight,
  runAgent,
  stopServer,
} from './harness/index.js';
import { PROMPTS } from './prompts.js';
import { latestCrawlRun } from './queries.js';
import { buildResult, saveResult } from './results.js';
import { grade, portalSecrets } from './graders/index.js';
import { judgeLoginLine, judgeTrial } from './graders/model/index.js';
import { loadGroundTruth, SUITE, taskFor, type EvalTask } from './tasks.js';

const parsed = parseConfig(process.argv.slice(2));
if (!parsed.ok) die(parsed.error);
const config = parsed.config;
preflight(config);
const task =
  taskFor(config.portal) ??
  die(`no task for ${config.portal}; the suite has: ${SUITE.map((t) => t.portal).join(', ')}`);
const groundTruth = loadGroundTruth(config.root, task);
process.exitCode = config.dryRun
  ? await dryRun(config, groundTruth)
  : await runTrial(config, task, groundTruth);

/** Everything up to the first paid call, including the vault, so a broken setup fails here. */
async function dryRun(c: EvalConfig, gt: GroundTruth): Promise<number> {
  const ws = createWorkspace(c.root, c.portal, c.env);
  const secrets = await portalSecrets(ws, c.portal, c.env);
  console.log(
    `dry run ok: ${c.portal} as ${c.persona}, budget $${c.budgetUsd}/agent, ground truth ${gt.portal_id}, ${secrets.length} secret(s) to sweep for`,
  );
  console.log(judgeLoginLine(c));
  return 0;
}

/**
 * One trial: portal up → crawler (map or trace, per the task) → BA unless `--crawler-only` →
 * grade → judges unless `--no-judges` (spec 017) → save; the portal server is always stopped.
 */
async function runTrial(c: EvalConfig, task: EvalTask, gt: GroundTruth): Promise<number> {
  const startedAt = new Date().toISOString();
  let server: ChildProcess | null = null;
  try {
    const up = await ensurePortal(c.root, task, c.sessionTimeoutS);
    if (!up.ok) return abort(up.error);
    server = up.server;
    const ws = c.inPlace ? c.root : createWorkspace(c.root, c.portal, c.env);
    console.log(`workspace: ${ws}`);
    const sessions = { crawler: randomUUID(), ba: c.crawlerOnly ? null : randomUUID() };
    let cost = emptyCost();
    cost = addCost(cost, runAgent(c, ws, 'crawler', crawlerPrompt(c, task), sessions.crawler));
    const crawlRunId =
      (await findCrawlRun(c, ws, startedAt)) ??
      abort(`the crawler made no run (session ${sessions.crawler})`);
    if (sessions.ba)
      cost = addCost(cost, runAgent(c, ws, 'ba', PROMPTS.ba(c.portal, crawlRunId), sessions.ba));
    const grades = await grade({
      config: c,
      task,
      ws,
      startedAt,
      groundTruth: gt,
      crawlRunId,
      sessionIds: [sessions.crawler, ...(sessions.ba ? [sessions.ba] : [])],
    });
    const judges = await judgeTrial(c, ws, gt);
    const workspace = c.inPlace ? undefined : ws;
    return saveResult(
      c,
      buildResult(c, { startedAt, crawlRunId, sessions, cost, grades, workspace, judges }),
    );
  } catch (e) {
    if (!(e instanceof EvalAbort)) throw e;
    console.error(e.message);
    return 2;
  } finally {
    stopServer(server);
  }
}

function crawlerPrompt(c: EvalConfig, task: EvalTask): string {
  return task.trace
    ? PROMPTS.crawlerTrace(c.portal, c.persona, task.trace.name, task.trace.goal)
    : PROMPTS.crawler(c.portal, c.persona);
}

async function findCrawlRun(c: EvalConfig, ws: string, since: string) {
  const db = openDb(dbPathFor(join(ws, 'data'), c.env));
  const run = latestCrawlRun(db.raw, c.portal, c.persona, since);
  await db.close();
  return run?.id;
}
