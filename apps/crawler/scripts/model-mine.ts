/**
 * Mine business rules (spec 039 design § 11): `pnpm model:mine <portal> --env <env>`.
 * Builds the observation table of every decision point of the portal model, runs
 * `pathfinder-miner rules` (apps/miner, Python) on each, and imports what comes back as
 * `decision_rule` hypotheses with their boundary tests, after Zod validation. Never runs on the
 * crawler's runtime path; needs `uv` (the miner's environment).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  dbPathFor,
  importMinedRule,
  loadObservationTables,
  migrateUp,
  openDb,
} from '@pathfinder/store';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--')
    ? process.argv[i + 1]
    : undefined;
};
const portal = process.argv[2];
const env = arg('env') ?? process.env.PATHFINDER_ENV;
if (!portal || portal.startsWith('--') || !env) {
  console.error('usage: pnpm model:mine <portal> --env <env>');
  process.exit(2);
}
const root = resolve(arg('root') ?? join(import.meta.dirname, '../../..'));
const minerDir = join(root, 'apps/miner');
const work = mkdtempSync(join(tmpdir(), 'pf-mine-'));
const opened = openDb(dbPathFor(join(root, 'data'), env));
try {
  migrateUp(opened.raw, join(root, 'data/migrations'));
  const tables = loadObservationTables(opened.raw, portal);
  console.log(`${portal} (${env}): ${tables.length} decision point(s)`);
  tables.forEach((table, i) => {
    const file = join(work, `table-${i}.json`);
    writeFileSync(file, JSON.stringify(table));
    const out = execFileSync(
      'uv',
      ['run', '--project', minerDir, 'pathfinder-miner', 'rules', '--in', file],
      { encoding: 'utf8' },
    );
    const key = importMinedRule(opened.raw, portal, table, JSON.parse(out));
    const where = `${table.decision_point.action} on ${table.decision_point.screen}`;
    console.log(`  ${where}: ${key ?? 'already recorded'} (${table.rows.length} rows)`);
  });
} finally {
  await opened.close();
  rmSync(work, { recursive: true, force: true });
}
