/**
 * Tier-2 eval (spec 009 R-27, contracts/gates-evals.md): run the real crawler and BA agents headless
 * against one portal, score the documentation against its ground truth, compare with the baseline.
 * Usage: pnpm eval <portal> [--persona guest] [--budget-usd 5] [--model <m>] [--env sandbox]
 *        [--promote] [--dry-run] [--in-place]
 * Writes data/evals/<portal>/<timestamp>.json; exit 1 on a regression, 2 on bad input or preflight.
 * Never part of `pnpm test`: it spends real tokens.
 *
 * By default the agents work in a fresh workspace (PATHFINDER_ROOT = a temp folder with copies of
 * portals/, personas/ and the migrations), so the developer's store and its documentation are
 * never touched and every eval starts from nothing. `--in-place` uses the real store instead
 * (then the runs show in the dashboard).
 */
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { dbPathFor, migrateUp, openDb } from '@pathfinder/core';
import { evaluate, GroundTruth, loadEvalInput } from '@pathfinder/docs';
import {
  compareEval,
  comparisonMarkdown,
  EvalResult,
  Tolerances,
  type EvalResult as Result,
} from '@pathfinder/gates';

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

const portal = argv[0];
if (!portal || portal.startsWith('--') || !/^[a-z0-9][a-z0-9_-]*$/.test(portal))
  die('usage: pnpm eval <portal> [--persona guest] [--budget-usd 5] [--promote] [--dry-run]');
const persona = arg('persona') ?? 'guest';
const budget = arg('budget-usd') ?? '5';
const env = arg('env') ?? 'sandbox';
const model = arg('model');
const evalDir = join(root, 'data', 'evals', portal!);

/**
 * The root the agents' servers record into: a fresh workspace, or the repo itself with --in-place.
 * The persona's credential rows are copied in (they stay encrypted; the same vault key opens them).
 */
function workspace(): string {
  if (has('in-place')) return root;
  const ws = mkdtempSync(join(tmpdir(), `pf-eval-${portal}-`));
  cpSync(join(root, 'portals'), join(ws, 'portals'), { recursive: true });
  cpSync(join(root, 'personas'), join(ws, 'personas'), { recursive: true });
  cpSync(join(root, 'data', 'migrations'), join(ws, 'data', 'migrations'), { recursive: true });
  const main = dbPathFor(join(root, 'data'), env);
  const target = openDb(dbPathFor(join(ws, 'data'), env));
  migrateUp(target.raw, join(ws, 'data', 'migrations'));
  if (existsSync(main)) {
    const src = openDb(main);
    // A store not yet migrated to 0007 has no credentials to copy (and is not migrated from here).
    const hasTable = src.raw
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'credentials'")
      .get();
    const rows = !hasTable
      ? []
      : (src.raw
          .prepare('SELECT * FROM credentials WHERE portal_id = ? AND environment = ?')
          .all(portal, env) as Record<string, unknown>[]);
    const insert = target.raw.prepare(
      `INSERT INTO credentials (id, portal_id, environment, ref_name, ciphertext, nonce, key_id, created_at, updated_at)
       VALUES (@id, @portal_id, @environment, @ref_name, @ciphertext, @nonce, @key_id, @created_at, @updated_at)`,
    );
    for (const r of rows) insert.run(r);
    void src.close();
  }
  void target.close();
  return ws;
}

function groundTruthPath(): string {
  if (portal === 'reference-insurer')
    return join(root, 'apps/crawler/packages/reference-portal/ground-truth.json');
  const m = /^proving-ground-(shop|bank|insurer)$/.exec(portal!);
  if (m) return join(root, 'apps/proving-ground/ground-truth', `${m[1]}.json`);
  return die(`no ground truth known for ${portal}; only reference-insurer and proving-ground-*`);
}

// ---- preflight ------------------------------------------------------------------------------------

function preflight(): void {
  const v = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (v.status !== 0) die('the Claude Code CLI ("claude") is not on PATH');
  // A crawler or BA server left over from an earlier session holds the store (spec 008 F-09).
  const ps = execFileSync('ps', ['-eo', 'pid,args'], { encoding: 'utf8' });
  const stale = ps
    .split('\n')
    .filter((l) => /mcp-server.*src\/(main|ba-main)\.ts/.test(l) && !l.includes('eval-run'));
  if (stale.length > 0)
    die(
      `stale pathfinder MCP server process(es) hold the store; stop them first:\n${stale.join('\n')}`,
    );
  if (!existsSync(join(root, 'portals', portal!, 'portal.yaml')))
    die(`no portals/${portal}/portal.yaml`);
}

async function healthy(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

/** Start the portal's local server when it is not up; returns the process to stop afterwards. */
async function ensurePortal(): Promise<ChildProcess | null> {
  const [probe, cmd, args] = portal!.startsWith('proving-ground-')
    ? [
        'http://127.0.0.1:4100/healthz',
        'node',
        [join(root, 'apps/proving-ground/scripts/start.mjs')],
      ]
    : portal === 'reference-insurer'
      ? [
          'http://127.0.0.1:4010/robots.txt',
          'pnpm',
          ['--dir', join(root, 'apps/crawler'), 'reference-portal'],
        ]
      : [null, null, null];
  if (!probe || (await healthy(probe))) return null;
  const child = spawn(cmd!, args as string[], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 300; i++) {
    if (await healthy(probe)) return child;
    await new Promise((r) => setTimeout(r, 300));
  }
  return die(`the portal did not come up at ${probe}`);
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
}

function runAgent(agent: 'crawler' | 'ba', prompt: string): CliOut {
  const args = [
    '-p',
    prompt,
    '--agent',
    agent,
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
  try {
    return JSON.parse(r.stdout) as CliOut;
  } catch {
    return die(`${agent} run gave no JSON (exit ${r.status}): ${r.stderr.slice(-800)}`);
  }
}

const PROMPTS = {
  crawler: (p: string, who: string) =>
    `Map the portal "${p}" as persona "${who}" in map mode, following your procedure until the frontier is empty or a budget ends. ${who === 'guest' ? '' : 'Log in right after the first navigate.'} Report as your Return section says.`,
  ba: (p: string, runId: string) =>
    `Document the portal "${p}" from the recorded map run ${runId}: start one analysis session over that run, do all seven passes as the ba-practice skill says, answer any pending feedback, and finish the session. Report as your Return section says.`,
};

// ---- main -------------------------------------------------------------------------------------------

preflight();
const gt = GroundTruth.parse(JSON.parse(readFileSync(groundTruthPath(), 'utf8')));
const started = new Date().toISOString();
if (has('dry-run')) {
  console.log(
    `dry run ok: ${portal} as ${persona}, budget $${budget}/agent, ground truth ${gt.portal_id}`,
  );
  process.exit(0);
}
const server = await ensurePortal();
const ws = workspace();
console.log(`workspace: ${ws}`);
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
try {
  const crawl = runAgent('crawler', PROMPTS.crawler(portal!, persona));
  add(crawl);
  const db = openDb(dbPathFor(join(ws, 'data'), env));
  const run = db.raw
    .prepare(
      'SELECT id, status FROM runs WHERE portal_id = ? AND persona_id = ? AND started_at >= ? ORDER BY started_at DESC LIMIT 1',
    )
    .get(portal, persona, started) as { id: string; status: string } | undefined;
  await db.close();
  if (!run) die(`the crawler made no run (its answer: ${(crawl.result ?? '').slice(0, 400)})`);

  const ba = runAgent('ba', PROMPTS.ba(portal!, run!.id));
  add(ba);

  const opened = openDb(dbPathFor(join(ws, 'data'), env));
  opened.raw.pragma('query_only = ON');
  const one = <T>(sql: string, ...p: unknown[]) => opened.raw.prepare(sql).get(...p) as T;
  const session = one<{ id: string } | undefined>(
    'SELECT s.id FROM analysis_sessions s WHERE s.portal_id = ? AND s.started_at >= ? ORDER BY s.started_at DESC LIMIT 1',
    portal,
    started,
  );
  const input = loadEvalInput(opened.raw, portal!);
  const report = evaluate({ portal_id: portal!, ...input, groundTruth: gt });
  const final = one<{ status: string; steps_used: number }>(
    'SELECT status, steps_used FROM runs WHERE id = ?',
    run!.id,
  );
  const pending = one<{ n: number }>(
    "SELECT count(*) AS n FROM frontier WHERE run_id = ? AND status = 'pending'",
    run!.id,
  ).n;
  const count = (rule: string) =>
    one<{ n: number }>(
      'SELECT count(*) AS n FROM decision_log WHERE run_id = ? AND rule = ?',
      run!.id,
      rule,
    ).n;
  const result: Result = EvalResult.parse({
    portal_id: portal,
    persona_id: persona,
    started_at: started,
    git_sha: execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    runs: { crawler: run!.id, ba_session: session?.id ?? null },
    cost,
    scores: Object.fromEntries(
      Object.entries(report.scores).map(([k, s]) => [
        k,
        { matched: s!.matched, total: s!.total, pct: s!.pct },
      ]),
    ),
    overclaims: report.overclaims.length,
    checks: {
      frontier_empty_at_finish: final.status === 'completed' && pending === 0,
      // false when the agent's budget cut the run short (status `interrupted`): not a fair baseline
      crawler_completed: final.status === 'completed',
      crawler_steps: final.steps_used,
      ba_session_completed:
        session !== undefined &&
        one<{ status: string }>('SELECT status FROM analysis_sessions WHERE id = ?', session.id)
          .status === 'completed',
      handoffs: input.handoffs.length,
      relogins: count('relogin'),
      logged_in: count('login') > 0 && persona !== 'guest',
    },
  });
  await opened.close();

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
  const cmp = compareEval(result, baseline, tolerances);
  process.stdout.write(comparisonMarkdown(result, cmp));
  console.log(`\nresult: ${file}`);
  if (has('promote') && result.checks.crawler_completed !== true && !has('force-promote'))
    console.log(
      'not promoted: the crawler run did not complete (budget?); raise --budget-usd or pass --force-promote',
    );
  else if (has('promote')) {
    if (baseline)
      renameSync(
        basePath,
        join(evalDir, 'history', `${baseline.started_at.replace(/[:.]/g, '-')}.json`),
      );
    writeFileSync(basePath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`promoted to ${basePath}`);
  }
  if (cmp.regressions.length > 0) process.exitCode = 1;
} finally {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGINT');
    } catch {
      /* gone */
    }
  }
}
