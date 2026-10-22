/**
 * Mining business rules after a rebuild (spec 039 design § 7 step 10, T062; spec 040 T030): the
 * observation table of every decision point goes to the miner, what comes back is imported as
 * `decision_rule` hypotheses, and guards along a path that cannot all hold become `ambiguous`.
 * The miner is given (`MinerRun`): `uvMiner` runs apps/miner through `uv` when both are present;
 * tests pass a stub. `pnpm model:mine`, the reconcile script and the run's end use the same code.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { importMinedRule, loadObservationTables, type MinerTable } from './rule-mining.js';
import { writeGuardConflicts } from './rule-guards.js';

type Raw = BetterSqlite3.Database;

/** One decision point's table in, the miner's JSON answer out. */
export type MinerRun = (table: MinerTable) => unknown;

export interface MinedRules {
  /** Per decision point: where, rows, and the key written (null: already recorded). */
  points: { where: string; rows: number; key: string | null }[];
  /** Rules whose guards cannot all hold along a path (`ambiguous`, for a person). */
  ambiguous: string[];
}

export function mineRules(raw: Raw, portal: string, run: MinerRun): MinedRules {
  const points = loadObservationTables(raw, portal).map((table) => ({
    where: `${table.decision_point.action} on ${table.decision_point.screen}`,
    rows: table.rows.length,
    key: importMinedRule(raw, portal, table, run(table)),
  }));
  return { points, ambiguous: writeGuardConflicts(raw, portal) };
}

function hasUv(): boolean {
  try {
    execFileSync('uv', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * The Python miner (`mudpuppy-miner rules`) through `uv`, or null when apps/miner or `uv` is
 * missing (a crawler-only install) or `MUDPUPPY_MINER=off`: then nothing is mined.
 */
export function uvMiner(repoRoot: string, env = process.env): MinerRun | null {
  const minerDir = join(repoRoot, 'apps', 'miner');
  if (env.MUDPUPPY_MINER === 'off' || !existsSync(join(minerDir, 'pyproject.toml'))) return null;
  if (!hasUv()) return null;
  return (table) => {
    const work = mkdtempSync(join(tmpdir(), 'pf-mine-'));
    try {
      const file = join(work, 'table.json');
      writeFileSync(file, JSON.stringify(table));
      const out = execFileSync(
        'uv',
        ['run', '--project', minerDir, 'mudpuppy-miner', 'rules', '--in', file],
        { encoding: 'utf8' },
      );
      return JSON.parse(out) as unknown;
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  };
}
