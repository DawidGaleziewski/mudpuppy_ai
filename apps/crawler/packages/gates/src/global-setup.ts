import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseCatalogue, parseEvalCases, parseScars, registeredInFolder } from './catalogue.js';
import {
  CATALOGUE,
  EVAL_CASES,
  FIXTURE_USERS,
  GATE_BASE,
  GATE_PORT,
  GATE_SESSION_TIMEOUT_S,
  GATE_TESTS,
  GATE_WIDGET_PORT,
  PROVING_GROUND,
  REPORT_FILE,
  RESULTS_FILE,
  SCAR_BASE,
  SCAR_CATALOGUE,
  SCAR_MAKER,
  SCAR_PORT,
} from './paths.js';

const estates: ChildProcess[] = [];

async function healthy(base: string): Promise<boolean> {
  try {
    return (await fetch(`${base}/healthz`)).ok;
  } catch {
    return false;
  }
}

/**
 * Spawn one estate and wait for its health check. A process already answering there is refused,
 * not reused: it may run stale code.
 */
async function startEstate(
  name: string,
  base: string,
  command: { args: string[]; opts?: SpawnOptions; waitMs: number },
): Promise<void> {
  if (await healthy(base))
    throw new Error(
      `something already serves ${base}; stop it (a stale ${name}?) before running the gates`,
    );
  const child = spawn('node', command.args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
    ...command.opts,
  });
  estates.push(child);
  let stderr = '';
  child.stderr?.on('data', (d) => (stderr += String(d)));
  const until = Date.now() + command.waitMs;
  while (Date.now() < until) {
    if (await healthy(base)) return;
    if (child.exitCode !== null)
      throw new Error(`${name} exited (${child.exitCode}): ${stderr.slice(-800)}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${name} did not answer ${base}/healthz: ${stderr.slice(-800)}`);
}

/**
 * Start the proving ground on the gate ports with the fixture users and short timeouts (spec 009
 * FR-023), and scar-maker on its gate port (spec 030 FR-003).
 */
export async function setup(): Promise<void> {
  rmSync(RESULTS_FILE, { force: true });
  await startEstate('proving ground', GATE_BASE, {
    args: [
      join(PROVING_GROUND, 'scripts', 'start.mjs'),
      '--port',
      String(GATE_PORT),
      '--widget-port',
      String(GATE_WIDGET_PORT),
      '--session-timeout',
      String(GATE_SESSION_TIMEOUT_S),
      '--cms-delay-ms',
      '150',
      '--seed-users',
      FIXTURE_USERS,
    ],
    waitMs: 110_000, // a cold build of the web apps included
  });
  await startEstate('scar-maker', SCAR_BASE, {
    // `--import tsx` resolves from scar-maker's own dependencies (cwd).
    args: ['--import', 'tsx', 'src/main.ts', '--port', String(SCAR_PORT)],
    opts: { cwd: SCAR_MAKER },
    waitMs: 30_000,
  });
}

export async function teardown(): Promise<void> {
  for (const e of estates) {
    if (!e.pid) continue;
    try {
      process.kill(-e.pid, 'SIGINT'); // the whole group: node, uv and python
    } catch {
      /* already gone */
    }
  }
  writeReport();
}

/** Scar ids of apps/scar-maker/scars.yaml (spec 030 FR-003): each needs a gate or gap case. */
function scarIds(): string[] {
  if (!existsSync(SCAR_CATALOGUE)) return [];
  return parseScars(readFileSync(SCAR_CATALOGUE, 'utf8')).map((e) => e.id);
}

interface Row {
  id: string;
  title: string;
  result: string;
  ms: number;
  note?: string;
}

/** `data/gates/report.json`: every case, the in-scope ids without one, and a summary (contracts/gates-evals.md). */
export function writeReport(): void {
  const rows: Row[] = existsSync(RESULTS_FILE)
    ? readFileSync(RESULTS_FILE, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Row)
    : [];
  const inScope = parseCatalogue(readFileSync(CATALOGUE, 'utf8')).filter(
    (r) => r.status === 'in scope',
  );
  const { gates, gaps } = registeredInFolder(GATE_TESTS);
  const gateFindings = (
    existsSync(EVAL_CASES) ? parseEvalCases(readFileSync(EVAL_CASES, 'utf8')) : []
  ).filter((c) => c.tier === 'gate');
  const uncovered = [
    ...inScope.map((r) => r.id),
    ...gateFindings.map((c) => c.id),
    ...scarIds(),
  ].filter((id) => !gates.has(id) && !gaps.has(id));
  const count = (r: string) => rows.filter((x) => x.result === r).length;
  const report = {
    generated_at: new Date().toISOString(),
    cases: rows.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })),
    uncovered,
    summary: {
      pass: count('pass'),
      fail: count('fail'),
      known_gap: count('known_gap'),
      gap_fixed: count('gap_fixed'),
      skipped_slow: count('skipped_slow'),
      uncovered: uncovered.length,
    },
  };
  mkdirSync(dirname(REPORT_FILE), { recursive: true });
  writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);
  rmSync(RESULTS_FILE, { force: true });
}
