/**
 * Tier-2 eval (spec 009 R-27, contracts/gates-evals.md; measures of spec 014 US1): run the real
 * crawler and BA agents headless against one portal, score the documentation and the crawl
 * against the portal's ground truth, sweep for leaked passwords, compare with the baseline.
 * Usage: see `USAGE` in config.ts. Writes data/evals/<portal>/<timestamp>.json; exit 1 on a
 * regression, 2 on bad input or preflight. Never part of `pnpm test`: it spends real tokens.
 *
 * By default the agents work in a fresh workspace (PATHFINDER_ROOT = a temp folder with copies of
 * portals/, personas/ and the migrations), so the developer's store and its documentation are
 * never touched and every eval starts from nothing. `--in-place` uses the real store instead.
 *
 * Where things are: cases.ts (portals + ground truth), prompts.ts, harness/ (workspace, portal
 * server, agents, cost), scorers/ (what is measured), results.ts (save, compare, promote).
 */
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { GroundTruth } from '@pathfinder/docs';
import { dbPathFor, openDb } from '@pathfinder/store';
import { caseFor, loadGroundTruth, type EvalCase } from './cases.js';
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
import { measure, portalSecrets } from './scorers/index.js';

const parsed = parseConfig(process.argv.slice(2));
if (!parsed.ok) die(parsed.error);
const config = parsed.config;
preflight(config);
const evalCase =
  caseFor(config.portal) ??
  die(`no ground truth known for ${config.portal}; only reference-insurer and proving-ground-*`);
const groundTruth = loadGroundTruth(config.root, evalCase);
process.exitCode = config.dryRun
  ? await dryRun(config, groundTruth)
  : await runEval(config, evalCase, groundTruth);

/** Everything up to the first paid call, including the vault, so a broken setup fails here. */
async function dryRun(c: EvalConfig, gt: GroundTruth): Promise<number> {
  const ws = createWorkspace(c.root, c.portal, c.env);
  const secrets = await portalSecrets(ws, c.portal, c.env);
  console.log(
    `dry run ok: ${c.portal} as ${c.persona}, budget $${c.budgetUsd}/agent, ground truth ${gt.portal_id}, ${secrets.length} secret(s) to sweep for`,
  );
  return 0;
}

/** Portal up → crawler → BA → measure → save; the portal server is stopped whatever happens. */
async function runEval(c: EvalConfig, evalCase: EvalCase, gt: GroundTruth): Promise<number> {
  const startedAt = new Date().toISOString();
  let server: ChildProcess | null = null;
  try {
    const up = await ensurePortal(c.root, evalCase, c.sessionTimeoutS);
    if (!up.ok) return abort(up.error);
    server = up.server;
    const ws = c.inPlace ? c.root : createWorkspace(c.root, c.portal, c.env);
    console.log(`workspace: ${ws}`);
    const sessions = { crawler: randomUUID(), ba: randomUUID() };
    let cost = emptyCost();
    cost = addCost(
      cost,
      runAgent(c, ws, 'crawler', PROMPTS.crawler(c.portal, c.persona), sessions.crawler),
    );
    const crawlRunId =
      (await findCrawlRun(c, ws, startedAt)) ??
      abort(`the crawler made no run (session ${sessions.crawler})`);
    cost = addCost(cost, runAgent(c, ws, 'ba', PROMPTS.ba(c.portal, crawlRunId), sessions.ba));
    const measures = await measure({
      config: c,
      ws,
      startedAt,
      groundTruth: gt,
      crawlRunId,
      sessionIds: [sessions.crawler, sessions.ba],
    });
    return saveResult(c, buildResult(c, { startedAt, crawlRunId, sessions, cost, measures }));
  } catch (e) {
    if (!(e instanceof EvalAbort)) throw e;
    console.error(e.message);
    return 2;
  } finally {
    stopServer(server);
  }
}

async function findCrawlRun(c: EvalConfig, ws: string, since: string) {
  const db = openDb(dbPathFor(join(ws, 'data'), c.env));
  const run = latestCrawlRun(db.raw, c.portal, c.persona, since);
  await db.close();
  return run?.id;
}
