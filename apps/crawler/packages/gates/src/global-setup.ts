import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseCatalogue, parseEvalCases, registeredInFolder } from './catalogue.js';
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
} from './paths.js';

let estate: ChildProcess | null = null;

async function healthy(): Promise<boolean> {
  try {
    return (await fetch(`${GATE_BASE}/healthz`)).ok;
  } catch {
    return false;
  }
}

/**
 * Start the proving ground on the gate ports with the fixture users and short timeouts (spec 009
 * FR-023). A process already answering there is refused, not reused: it may run stale code.
 */
export async function setup(): Promise<void> {
  rmSync(RESULTS_FILE, { force: true });
  if (await healthy())
    throw new Error(
      `something already serves ${GATE_BASE}; stop it (a stale proving ground?) before running the gates`,
    );
  estate = spawn(
    'node',
    [
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
    { stdio: ['ignore', 'ignore', 'pipe'], detached: true },
  );
  let stderr = '';
  estate.stderr?.on('data', (d) => (stderr += String(d)));
  const until = Date.now() + 110_000; // a cold build of the web apps included
  while (Date.now() < until) {
    if (await healthy()) return;
    if (estate.exitCode !== null)
      throw new Error(`proving ground exited (${estate.exitCode}): ${stderr.slice(-800)}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`proving ground did not answer ${GATE_BASE}/healthz: ${stderr.slice(-800)}`);
}

export async function teardown(): Promise<void> {
  if (estate?.pid) {
    try {
      process.kill(-estate.pid, 'SIGINT'); // the whole group: node, uv and python
    } catch {
      /* already gone */
    }
  }
  writeReport();
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
  const uncovered = [...inScope.map((r) => r.id), ...gateFindings.map((c) => c.id)].filter(
    (id) => !gates.has(id) && !gaps.has(id),
  );
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
