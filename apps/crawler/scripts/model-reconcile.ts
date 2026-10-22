/**
 * Rebuild the portal model (spec 039 design § 7): `pnpm model:reconcile <portal> --env <env> [--rebuild]`.
 * Without `--rebuild` it writes a new model version only when something was recorded or decided
 * since the last one; with it, every status is derived again (ids stay). The MCP server runs the
 * same writer after `finish_run`.
 */
import { join, resolve } from 'node:path';
import {
  dbPathFor,
  migrateUp,
  mineRules,
  openDb,
  reconcilePortalModel,
  uvMiner,
  writePlannerMarks,
} from '@mudpuppy/store';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--')
    ? process.argv[i + 1]
    : undefined;
};
const portal = process.argv[2];
const env = arg('env') ?? process.env.MUDPUPPY_ENV;
if (!portal || portal.startsWith('--') || !env) {
  console.error('usage: pnpm model:reconcile <portal> --env <env> [--rebuild]');
  process.exit(2);
}
const root = resolve(arg('root') ?? join(import.meta.dirname, '../../..'));
const opened = openDb(dbPathFor(join(root, 'data'), env));
try {
  migrateUp(opened.raw, join(root, 'data/migrations'));
  const r = reconcilePortalModel(opened.raw, portal, {
    rebuild: process.argv.includes('--rebuild'),
  });
  console.log(
    r.modelVersion === null
      ? `${portal} (${env}): nothing new since the last model version`
      : `${portal} (${env}): model version ${r.seq} written`,
  );
  for (const [k, v] of Object.entries(r.stats)) console.log(`  ${k}: ${v}`);
  // Design § 7 step 10 (spec 040 T030): mine the new version's rules when the miner is installed.
  const miner = r.modelVersion === null ? null : uvMiner(root);
  if (miner) {
    const mined = mineRules(opened.raw, portal, miner);
    const written = mined.points.filter((p) => p.key !== null).length;
    console.log(`  rules mined: ${written} new of ${mined.points.length} decision point(s)`);
  }
  // Design § 14.1 (spec 040 T033): the planner's marks for the probe and exploration runs.
  const planned = writePlannerMarks(opened.raw, portal);
  console.log(`  planner: ${planned.length} item(s) for probe and exploration runs`);
} finally {
  await opened.close();
}
