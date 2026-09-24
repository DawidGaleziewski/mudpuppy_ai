/**
 * Delete everything one portal gathered (spec 002 FR-028, contracts/operator-cli.md).
 * Usage: pnpm portal:delete <portal> --env <env> --operator "<name>" [--yes] [--root <repo root>]
 * Without --yes it only prints what would be deleted. Refuses (exit 1) while a run of the portal is
 * running. Never touches portals/<portal>/ or personas/<portal>/ (configuration lives in git).
 */
import { join, resolve } from 'node:path';
import {
  PortalDataError,
  dbPathFor,
  deletePortal,
  migrateUp,
  openDb,
  planPortalDelete,
} from '@pathfinder/core';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--')
    ? process.argv[i + 1]
    : undefined;
};
const portal = process.argv[2];
const env = arg('env');
const operator = arg('operator');
if (
  !portal ||
  portal.startsWith('--') ||
  !/^[a-z0-9][a-z0-9_-]*$/.test(portal) ||
  !env ||
  !operator
) {
  console.error('usage: pnpm portal:delete <portal> --env <env> --operator "<name>" [--yes]');
  process.exit(2);
}
const root = resolve(arg('root') ?? join(import.meta.dirname, '../../..'));
const evidenceDir = join(root, 'data/evidence');
const opened = openDb(dbPathFor(join(root, 'data'), env));
try {
  migrateUp(opened.raw, join(root, 'data/migrations'));
  const plan = process.argv.includes('--yes')
    ? deletePortal({ raw: opened.raw, evidenceDir, portal, environment: env, operator })
    : planPortalDelete({ raw: opened.raw, evidenceDir, portal });
  const verb = process.argv.includes('--yes') ? 'deleted' : 'would delete (dry run, add --yes)';
  console.log(`${verb}: ${portal} (${env})`);
  for (const [t, n] of Object.entries(plan.counts)) console.log(`  ${t}: ${n}`);
  console.log(`  evidence files removed: ${plan.evidenceToRemove.length}`);
  console.log(`  evidence files kept (shared with another portal): ${plan.evidenceKept.length}`);
  if (!process.argv.includes('--yes') && plan.running.length > 0) {
    console.log(
      `  NOTE: run(s) still running: ${plan.running.join(', ')}; delete would be refused`,
    );
  }
} catch (e) {
  if (!(e instanceof PortalDataError)) throw e;
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await opened.close();
}
