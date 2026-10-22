/**
 * Mine business rules (spec 039 design § 11): `pnpm model:mine <portal> --env <env>`.
 * Builds the observation table of every decision point of the portal model, runs
 * `mudpuppy-miner rules` (apps/miner, Python) on each, and imports what comes back as
 * `decision_rule` hypotheses with their boundary tests, after Zod validation. Never runs on the
 * crawler's runtime path; needs `uv` (the miner's environment). The run's end and
 * `pnpm model:reconcile` do the same after a new model version (`mineRules`, spec 040 T030).
 */
import { join, resolve } from 'node:path';
import { proposeBoundarySuites } from '@mudpuppy/mcp-server';
import { dbPathFor, migrateUp, mineRules, openDb, uvMiner } from '@mudpuppy/store';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--')
    ? process.argv[i + 1]
    : undefined;
};
const portal = process.argv[2];
const env = arg('env') ?? process.env.MUDPUPPY_ENV;
if (!portal || portal.startsWith('--') || !env) {
  console.error('usage: pnpm model:mine <portal> --env <env>');
  process.exit(2);
}
const root = resolve(arg('root') ?? join(import.meta.dirname, '../../..'));
const miner = uvMiner(root, { ...process.env, MUDPUPPY_MINER: 'on' });
if (miner === null) {
  console.error('the miner needs apps/miner and uv on the PATH');
  process.exit(2);
}
const opened = openDb(dbPathFor(join(root, 'data'), env));
try {
  migrateUp(opened.raw, join(root, 'data/migrations'));
  const mined = mineRules(opened.raw, portal, miner);
  console.log(`${portal} (${env}): ${mined.points.length} decision point(s)`);
  for (const p of mined.points)
    console.log(`  ${p.where}: ${p.key ?? 'already recorded'} (${p.rows} rows)`);
  // Design § 11.6: guards along each path that cannot all hold become `ambiguous` (T064).
  for (const key of mined.ambiguous)
    console.log(`  guards that cannot all hold: ${key} (ambiguous, for a person)`);
  // Design § 11.5 (spec 040 T035): each rule's boundary tests wait in Review as a probe suite.
  for (const id of proposeBoundarySuites(opened.raw, portal))
    console.log(`  boundary tests for the owner: probe suite ${id} (Review)`);
} finally {
  await opened.close();
}
