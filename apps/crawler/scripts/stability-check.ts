/**
 * SC-005 check: how many matched states have identical fingerprints across two runs (target >= 90%).
 * Usage: pnpm stability <runA> <runB> [--env production] [--root <repo root>]
 */
import { join, resolve } from 'node:path';
import { compareRuns, dbPathFor, openDb } from '@pathfinder/core';

const args = process.argv
  .slice(2)
  .filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1]!.startsWith('--')));
const flag = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const [runA, runB] = args;
if (!runA || !runB) {
  console.error('usage: stability-check <runA> <runB> [--env production] [--root <dir>]');
  process.exit(2);
}

const root = resolve(flag('root', join(import.meta.dirname, '../../..')));
const opened = openDb(dbPathFor(join(root, 'data'), flag('env', 'production')));
try {
  const r = await compareRuns(opened.db, runA, runB);
  console.log(
    `matched ${r.matched} route templates, ${r.stable} stable (${(r.ratio * 100).toFixed(1)}%)`,
  );
  for (const u of r.unstable)
    console.log(`UNSTABLE ${u.route_template}: ${u.only_in_a} only in A, ${u.only_in_b} only in B`);
  const ok = r.ratio >= 0.9;
  console.log(ok ? 'OK: >= 90% stable' : 'FAIL: below the 90% target');
  process.exitCode = ok ? 0 : 1;
} finally {
  await opened.close();
}
