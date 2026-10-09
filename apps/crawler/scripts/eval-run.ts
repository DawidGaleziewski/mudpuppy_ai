/**
 * Tier-2 eval (spec 009 R-27, contracts/gates-evals.md; measures of spec 014 US1): run the real
 * crawler and BA agents headless against one portal, score the documentation against its ground
 * truth, measure the crawl and sweep for leaked passwords, compare with the baseline.
 * Usage: pnpm eval <portal> [--persona guest] [--budget-usd 5] [--model <m>] [--env sandbox]
 *        [--session-timeout <s>] [--promote [--force-promote]] [--dry-run] [--in-place]
 * Writes data/evals/<portal>/<timestamp>.json; exit 1 on a regression, 2 on bad input or preflight.
 * Never part of `pnpm test`: it spends real tokens.
 *
 * By default the agents work in a fresh workspace (PATHFINDER_ROOT = a temp folder with copies of
 * portals/, personas/ and the migrations), so the developer's store and its documentation are
 * never touched and every eval starts from nothing. `--in-place` uses the real store instead
 * (then the runs show in the dashboard).
 */
import { execFileSync, spawnSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { evaluate, GroundTruth, loadEvalInput } from '@pathfinder/docs';
import { dbPathFor, openDb } from '@pathfinder/store';
import {
  compareEval,
  comparisonMarkdown,
  crawlScreens,
  EvalResult,
  HARD_ZERO_CHECKS,
  passwordHits,
  Tolerances,
  widgetActions,
  type EvalResult as Result,
} from '@pathfinder/gates';
import { ensurePortal, stopServer } from './eval/estate.js';
import { portalSecrets, sweepPlaces, transcriptPath, writeWorkspaceExport } from './eval/sweep.js';
import { createWorkspace, groundTruthPath } from './eval/workspace.js';

const root = resolve(join(import.meta.dirname, '../../..'));
const argv = process.argv.slice(2);
const arg = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`);
  return i > -1 && argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[i + 1] : undefined;
};
const has = (n: string) => argv.includes(`--${n}`);
const die = (msg: string, code = 2): never => {
  console.error(msg);
  process.exit(code);
};
/** Inside the run: throw, so `finally` still stops the portal server (spec 009 F-16). */
class EvalAbort extends Error {}
const abort = (msg: string): never => {
  throw new EvalAbort(msg);
};

const portal = argv[0];
if (!portal || portal.startsWith('--') || !/^[a-z0-9][a-z0-9_-]*$/.test(portal))
  die('usage: pnpm eval <portal> [--persona guest] [--budget-usd 5] [--promote] [--dry-run]');
const persona = arg('persona') ?? 'guest';
const budget = arg('budget-usd') ?? '5';
const env = arg('env') ?? 'sandbox';
const model = arg('model');
const timeoutArg = arg('session-timeout');
const sessionTimeout = timeoutArg === undefined ? undefined : Number(timeoutArg);
if (sessionTimeout !== undefined && !(Number.isInteger(sessionTimeout) && sessionTimeout > 0))
  die('--session-timeout takes a whole number of seconds');
const evalDir = join(root, 'data', 'evals', portal!);

// ---- preflight ------------------------------------------------------------------------------------

function preflight(): void {
  const v = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (v.status !== 0) die('the Claude Code CLI ("claude") is not on PATH');
  // A crawler or BA server left over from an earlier session holds the store (spec 008 F-09).
  // Only the real store: a fresh workspace has its own, and the developer's Claude Code session
  // keeps its own servers on the real one (spec 014 F-01).
  const ps = execFileSync('ps', ['-eo', 'pid,args'], { encoding: 'utf8' });
  const stale = ps
    .split('\n')
    .filter((l) => /mcp-server.*src\/(main|ba-main)\.ts/.test(l) && !l.includes('eval-run'));
  if (has('in-place') && stale.length > 0)
    die(
      `stale pathfinder MCP server process(es) hold the store; stop them first:\n${stale.join('\n')}`,
    );
  if (!existsSync(join(root, 'portals', portal!, 'portal.yaml')))
    die(`no portals/${portal}/portal.yaml`);
}

// ---- headless agents --------------------------------------------------------------------------------

interface CliOut {
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  is_error?: boolean;
  subtype?: string;
}

/** One headless agent session; `sessionId` names its transcript for the password sweep. */
function runAgent(ws: string, agent: 'crawler' | 'ba', prompt: string, sessionId: string): CliOut {
  const args = [
    '-p',
    prompt,
    '--agent',
    agent,
    '--session-id',
    sessionId,
    '--output-format',
    'json',
    '--max-budget-usd',
    budget,
    '--mcp-config',
    join(root, '.mcp.json'),
    '--strict-mcp-config',
    // Only the agent's own server: every tool of it, nothing else.
    '--allowedTools',
    agent === 'crawler' ? 'mcp__pathfinder' : 'mcp__pathfinder-ba',
    ...(model ? ['--model', model] : []),
  ];
  const r = spawnSync('claude', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PATHFINDER_ENV: env, PATHFINDER_ROOT: ws },
  });
  let out: CliOut;
  try {
    out = JSON.parse(r.stdout) as CliOut;
  } catch {
    return abort(`${agent} run gave no JSON (exit ${r.status}): ${r.stderr.slice(-800)}`);
  }
  // An API error (account usage limit, overload) cuts the agent off mid-work: its scores would
  // measure the outage, not the agent, so there is no result at all (spec 014 F-04). Running out
  // of the eval's own budget is a fair end and stays a result (`crawler_completed`).
  const limited = /hit your .*limit|rate.?limit/i.test(out.result ?? '');
  if (limited || (out.is_error === true && out.subtype !== 'error_max_budget_usd'))
    abort(
      `${agent} session ${sessionId} ended with an error (${out.subtype ?? 'no subtype'}): ${(out.result ?? '').slice(0, 300)}; no result written`,
    );
  return out;
}

const PROMPTS = {
  crawler: (p: string, who: string) =>
    `Map the portal "${p}" as persona "${who}" in map mode, following your procedure until the frontier is empty or a budget ends. ${who === 'guest' ? '' : 'Log in right after the first navigate.'} Report as your Return section says.`,
  ba: (p: string, runId: string) =>
    `Document the portal "${p}" from the recorded map run ${runId}: start one analysis session over that run, do all seven passes as the ba-practice skill says, answer any pending feedback, and finish the session. Report as your Return section says.`,
};

// ---- measures ---------------------------------------------------------------------------------------

interface Sessions {
  crawler: string;
  ba: string;
}

/** Score, measure and sweep the workspace after both agents ran (spec 014 US1). */
async function measure(ws: string, gt: GroundTruth, runId: string, sessions: Sessions) {
  const opened = openDb(dbPathFor(join(ws, 'data'), env));
  opened.raw.pragma('query_only = ON');
  const one = <T>(sql: string, ...p: unknown[]) => opened.raw.prepare(sql).get(...p) as T;
  const col = (sql: string, ...p: unknown[]) =>
    (opened.raw.prepare(sql).all(...p) as { v: string }[]).map((r) => r.v);
  const session = one<{ id: string; status: string } | undefined>(
    'SELECT id, status FROM analysis_sessions WHERE portal_id = ? AND started_at >= ? ORDER BY started_at DESC LIMIT 1',
    portal,
    started,
  );
  const input = loadEvalInput(opened.raw, portal!);
  const report = evaluate({ portal_id: portal!, ...input, groundTruth: gt });
  const final = one<{ status: string; steps_used: number }>(
    'SELECT status, steps_used FROM runs WHERE id = ?',
    runId,
  );
  const pending = one<{ n: number }>(
    "SELECT count(*) AS n FROM frontier WHERE run_id = ? AND status = 'pending'",
    runId,
  ).n;
  const count = (rule: string) =>
    one<{ n: number }>(
      'SELECT count(*) AS n FROM decision_log WHERE run_id = ? AND rule = ?',
      runId,
      rule,
    ).n;
  const routes = col(
    'SELECT DISTINCT s.route_template AS v FROM state_observations o JOIN states s ON s.id = o.state_id WHERE o.run_id = ?',
    runId,
  );
  const crawl = crawlScreens(gt.screens, routes, persona !== 'guest');
  const widget = widgetActions({
    edgeActions: col(
      "SELECT action_json AS v FROM edges WHERE run_id = ? AND status = 'executed'",
      runId,
    ),
    actionCalls: col(
      'SELECT url_template AS v FROM network_calls WHERE run_id = ? AND edge_id IS NOT NULL',
      runId,
    ),
  });
  await opened.close();
  console.log(
    `crawl: ${crawl.matched}/${crawl.total} ground-truth screens${crawl.missing.length ? `, missing ${crawl.missing.join(', ')}` : ''}; frontier pending ${pending}`,
  );
  const hits = await sweep(ws, sessions);
  return {
    session,
    scores: {
      ...Object.fromEntries(
        Object.entries(report.scores).map(([k, s]) => [
          k,
          { matched: s.matched, total: s.total, pct: s.pct },
        ]),
      ),
      crawl_screens: { matched: crawl.matched, total: crawl.total, pct: crawl.pct },
    },
    overclaims: report.overclaims.length,
    checks: {
      frontier_empty_at_finish: final.status === 'completed' && pending === 0,
      // false when the agent's budget cut the run short (status `interrupted`): not a fair baseline
      crawler_completed: final.status === 'completed',
      crawler_steps: final.steps_used,
      frontier_pending: pending,
      ba_session_completed: session?.status === 'completed',
      handoffs: input.handoffs.length,
      relogins: count('relogin'),
      logged_in: count('login') > 0 && persona !== 'guest',
      password_hits: hits.total,
      widget_actions: widget,
    },
  };
}

/** SC-003: the portal's passwords in the store, files, export and both transcripts (D3). */
async function sweep(ws: string, sessions: Sessions) {
  const exported = writeWorkspaceExport(ws, portal!, env);
  const transcripts = [sessions.crawler, sessions.ba]
    .map(transcriptPath)
    .filter((t): t is string => t !== null);
  if (transcripts.length < 2) console.warn(`warning: found ${transcripts.length} of 2 transcripts`);
  const secrets = await portalSecrets(ws, portal!, env);
  const hits = passwordHits(sweepPlaces(ws, env, transcripts), secrets);
  console.log(
    `password sweep: ${secrets.length} secret(s), ${transcripts.length} transcript(s), export ${exported ? 'yes' : 'none'}: ${hits.total} hit(s)${hits.total ? ` in ${Object.keys(hits.byPlace).join(', ')}` : ''}`,
  );
  return hits;
}

// ---- main -------------------------------------------------------------------------------------------

preflight();
const gtPath = groundTruthPath(root, portal!);
if (!gtPath)
  die(`no ground truth known for ${portal}; only reference-insurer and proving-ground-*`);
const gt = GroundTruth.parse(JSON.parse(readFileSync(gtPath!, 'utf8')));
const started = new Date().toISOString();
if (has('dry-run')) {
  // Also opens the vault, so a missing key or a broken copy fails here, not after a paid crawl.
  const ws = createWorkspace(root, portal!, env);
  const secrets = await portalSecrets(ws, portal!, env);
  console.log(
    `dry run ok: ${portal} as ${persona}, budget $${budget}/agent, ground truth ${gt.portal_id}, ${secrets.length} secret(s) to sweep for`,
  );
  process.exit(0);
}

function save(result: Result): void {
  mkdirSync(join(evalDir, 'history'), { recursive: true });
  const file = join(evalDir, `${started.replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  const basePath = join(evalDir, 'baseline.json');
  const baseline = existsSync(basePath)
    ? EvalResult.parse(JSON.parse(readFileSync(basePath, 'utf8')))
    : null;
  const tolPath = join(evalDir, 'tolerances.json');
  const tolerances = existsSync(tolPath)
    ? Tolerances.parse(JSON.parse(readFileSync(tolPath, 'utf8')))
    : {};
  if (baseline && baseline.conditions?.session_timeout_s !== result.conditions?.session_timeout_s)
    console.warn(
      `warning: the baseline ran with session timeout ${baseline.conditions?.session_timeout_s ?? 'default'}, this eval with ${result.conditions?.session_timeout_s ?? 'default'}: not comparable`,
    );
  const cmp = compareEval(result, baseline, tolerances);
  process.stdout.write(comparisonMarkdown(result, cmp));
  console.log(`\nresult: ${file}`);
  if (has('promote')) promote(result, baseline, cmp.regressions);
  if (cmp.regressions.length > 0) process.exitCode = 1;
}

/** Replace the baseline, keeping the old one in history/; never a run that broke a hard check. */
function promote(result: Result, baseline: Result | null, regressions: string[]): void {
  const hard = regressions.filter((r) =>
    (HARD_ZERO_CHECKS as readonly string[]).some((c) => r === `check:${c}`),
  );
  if (result.checks.crawler_completed !== true && !has('force-promote'))
    return console.log(
      'not promoted: the crawler run did not complete (budget?); raise --budget-usd or pass --force-promote',
    );
  if (hard.length > 0) return console.log(`not promoted: ${hard.join(', ')} above 0`);
  const basePath = join(evalDir, 'baseline.json');
  if (baseline)
    renameSync(
      basePath,
      join(evalDir, 'history', `${baseline.started_at.replace(/[:.]/g, '-')}.json`),
    );
  writeFileSync(basePath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`promoted to ${basePath}`);
}

const cost = { usd: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0 };
const add = (o: CliOut) => {
  cost.usd += o.total_cost_usd ?? 0;
  cost.input_tokens +=
    (o.usage?.input_tokens ?? 0) +
    (o.usage?.cache_read_input_tokens ?? 0) +
    (o.usage?.cache_creation_input_tokens ?? 0);
  cost.output_tokens += o.usage?.output_tokens ?? 0;
  cost.duration_ms += o.duration_ms ?? 0;
};
let server: ChildProcess | null = null;
try {
  const up = await ensurePortal(root, portal!, sessionTimeout);
  if (!up.ok) abort(up.error);
  server = up.ok ? up.server : null;
  const ws = has('in-place') ? root : createWorkspace(root, portal!, env);
  console.log(`workspace: ${ws}`);
  const sessions: Sessions = { crawler: randomUUID(), ba: randomUUID() };
  add(runAgent(ws, 'crawler', PROMPTS.crawler(portal!, persona), sessions.crawler));
  const db = openDb(dbPathFor(join(ws, 'data'), env));
  const run = db.raw
    .prepare(
      'SELECT id, status FROM runs WHERE portal_id = ? AND persona_id = ? AND started_at >= ? ORDER BY started_at DESC LIMIT 1',
    )
    .get(portal, persona, started) as { id: string; status: string } | undefined;
  await db.close();
  if (!run) abort(`the crawler made no run (session ${sessions.crawler})`);
  add(runAgent(ws, 'ba', PROMPTS.ba(portal!, run!.id), sessions.ba));
  const m = await measure(ws, gt, run!.id, sessions);
  save(
    EvalResult.parse({
      portal_id: portal,
      persona_id: persona,
      started_at: started,
      git_sha: execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      runs: {
        crawler: run!.id,
        ba_session: m.session?.id ?? null,
        crawler_cli_session: sessions.crawler,
        ba_cli_session: sessions.ba,
      },
      ...(sessionTimeout === undefined
        ? {}
        : { conditions: { session_timeout_s: sessionTimeout } }),
      cost,
      scores: m.scores,
      overclaims: m.overclaims,
      checks: m.checks,
    }),
  );
} catch (e) {
  if (!(e instanceof EvalAbort)) throw e;
  console.error(e.message);
  process.exitCode = 2;
} finally {
  stopServer(server);
}
