/**
 * Tier-2 eval (spec 009 R-27, contracts/gates-evals.md; graders of spec 014 US1): one trial of
 * one task. The real crawler and BA agents run headless against the task's portal, the graders
 * score the outcome (documentation and crawl) against the portal's ground truth and check the
 * transcripts for leaked passwords, and the result is compared with the baseline.
 * Terms follow Anthropic's eval vocabulary (G-33; table in README.md).
 * Usage: see `USAGE` in config.ts. Writes data/evals/<portal>/<timestamp>.json; exit 1 on a
 * regression, 2 on bad input, preflight or an agent's API error, 3 on the account's usage limit
 * (README "Running several"). Never part of `pnpm test`: it spends real tokens.
 *
 * By default the agents work in a fresh workspace (PATHFINDER_ROOT = a temp folder with copies of
 * portals/, personas/ and the migrations), so the developer's store and its documentation are
 * never touched and every eval starts from nothing. `--in-place` uses the real store instead.
 *
 * Where things are: tasks.ts (the suite: portals + ground truth), prompts.ts, harness/ (workspace, portal
 * server, agents, cost), graders/ (what is scored, by kind), results.ts (save, compare, promote).
 */
import { randomUUID } from 'node:crypto';
import type { GroundTruth } from '@pathfinder/docs';
import { parseConfig, type EvalConfig } from './config.js';
import { abort, die, EvalAbort } from './failures.js';
import {
  addCost,
  createWorkspace,
  emptyCost,
  ensurePortal,
  findCrawlRun,
  preflight,
  runAgent,
  runProcessTraces,
  stopServer,
  type StartedServer,
} from './harness/index.js';
import { acquireEvalLock } from './harness/lock.js';
import { PROMPTS } from './prompts.js';
import { buildResult, saveResult } from './results.js';
import { grade, portalSecrets } from './graders/index.js';
import { judgeLoginLine, judgeTrial } from './graders/model/index.js';
import { loadGroundTruth, processTracesFor, SUITE, taskFor, type EvalTask } from './tasks.js';

const parsed = parseConfig(process.argv.slice(2));
if (!parsed.ok) die(parsed.error);
const config = parsed.config;
preflight(config);
const task =
  taskFor(config.portal) ??
  die(`no task for ${config.portal}; the suite has: ${SUITE.map((t) => t.portal).join(', ')}`);
const groundTruth = loadGroundTruth(config.root, task);
process.exitCode = config.dryRun
  ? await dryRun(config, task, groundTruth)
  : await oneAtATime(() => runTrial(config, task, groundTruth));

/** Evals share the account's usage quota: a second one at the same time is refused (spec 020 T004). */
async function oneAtATime(trial: () => Promise<number>): Promise<number> {
  const lock = acquireEvalLock();
  if (!lock.ok) die(`another eval is running (pid ${lock.pid}); evals run one at a time`);
  try {
    return await trial();
  } finally {
    lock.release();
  }
}

/** Everything up to the first paid call, including the vault, so a broken setup fails here. */
async function dryRun(c: EvalConfig, task: EvalTask, gt: GroundTruth): Promise<number> {
  const ws = createWorkspace(c.root, c.portal, c.env);
  const secrets = await portalSecrets(ws, c.portal, c.env);
  const traces = processTracesFor(task, c.persona, c.processTraces);
  console.log(
    `dry run ok: ${c.portal} as ${c.persona}, budget $${c.budgetUsd}/agent, ground truth ${gt.portal_id}, ${secrets.length} secret(s) to sweep for, ${traces.length} process trace(s)`,
  );
  console.log(judgeLoginLine(c));
  return 0;
}

/**
 * One trial: portal up → crawler (map or trace, per the task) → the task's process traces
 * (spec 025, guest only, unless `--no-process-traces`) → BA unless `--crawler-only`: one session
 * over the map, then one over the traces for processes only (spec 025 F-12) →
 * grade → judges unless `--no-judges` (spec 017) → save; the portal server is always stopped.
 */
async function runTrial(c: EvalConfig, task: EvalTask, gt: GroundTruth): Promise<number> {
  const startedAt = new Date().toISOString();
  let server: StartedServer | null = null;
  try {
    const up = await ensurePortal(c.root, task, c.sessionTimeoutS);
    if (!up.ok) return abort(up.error);
    server = up.server;
    const ws = c.inPlace ? c.root : createWorkspace(c.root, c.portal, c.env);
    console.log(`workspace: ${ws}`);
    const traceTasks = processTracesFor(task, c.persona, c.processTraces);
    const withBa = !c.crawlerOnly;
    const sessions = {
      crawler: randomUUID(),
      ba: withBa ? randomUUID() : null,
      baTraces: withBa && traceTasks.length > 0 ? randomUUID() : null,
    };
    const crawler = runAgent(c, ws, 'crawler', crawlerPrompt(c, task), sessions.crawler);
    let cost = addCost(emptyCost(), crawler.out);
    const crawlRunId =
      (await findCrawlRun(c, ws, startedAt)) ??
      abort(`the crawler made no run (session ${sessions.crawler})`);
    const traces = await runProcessTraces(c, ws, traceTasks);
    for (const t of traces) cost = addCost(cost, t.out);
    const { ba, baTraces } = runBaSessions(c, ws, crawlRunId, traces, sessions);
    if (ba) cost = addCost(cost, ba.out);
    if (baTraces) cost = addCost(cost, baTraces.out);
    const outcomes = {
      crawler: crawler.outcome,
      ...(ba && { ba: ba.outcome }),
      ...(baTraces && { ba_traces: baTraces.outcome }),
      ...(traces.length > 0 && { process_traces: traces.map((t) => t.outcome) }),
    };
    const grades = await grade({
      config: c,
      task,
      ws,
      startedAt,
      groundTruth: gt,
      crawlRunId,
      processTraces: traces.map((t) => ({ processId: t.processId, runId: t.runId })),
      sessionIds: [
        sessions.crawler,
        ...traces.map((t) => t.session),
        ...(sessions.ba ? [sessions.ba] : []),
        ...(baTraces && sessions.baTraces ? [sessions.baTraces] : []),
      ],
    });
    const judges = await judgeTrial(c, ws, gt);
    const workspace = c.inPlace ? undefined : ws;
    return saveResult(
      c,
      buildResult(c, {
        startedAt,
        crawlRunId,
        sessions: { ...sessions, baTraces: baTraces ? sessions.baTraces : null },
        processTraces: traces.map((t) => ({
          process_id: t.processId,
          run: t.runId,
          cli_session: t.session,
        })),
        outcomes,
        cost,
        grades,
        workspace,
        judges,
      }),
    );
  } catch (e) {
    if (!(e instanceof EvalAbort)) throw e;
    console.error(e.message);
    return e.code;
  } finally {
    await stopServer(server);
  }
}

/** Two BA sessions (spec 025 F-12): the map as before, then the traces for processes only. */
function runBaSessions(
  c: EvalConfig,
  ws: string,
  crawlRunId: string,
  traces: Awaited<ReturnType<typeof runProcessTraces>>,
  sessions: { ba: string | null; baTraces: string | null },
) {
  const ba = sessions.ba
    ? runAgent(c, ws, 'ba', PROMPTS.ba(c.portal, crawlRunId), sessions.ba)
    : null;
  const baTraces =
    sessions.baTraces && traces.length > 0
      ? runAgent(
          c,
          ws,
          'ba',
          PROMPTS.baTraces(
            c.portal,
            traces.map((t) => t.runId),
          ),
          sessions.baTraces,
        )
      : null;
  return { ba, baTraces };
}

function crawlerPrompt(c: EvalConfig, task: EvalTask): string {
  return task.trace
    ? PROMPTS.crawlerTrace(c.portal, c.persona, task.trace.name, task.trace.goal)
    : PROMPTS.crawler(c.portal, c.persona);
}
