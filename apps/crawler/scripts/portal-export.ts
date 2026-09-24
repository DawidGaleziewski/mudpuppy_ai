/**
 * Export everything one portal gathered (spec 002 FR-028, contracts/operator-cli.md).
 * Usage: pnpm portal:export <portal> [--env production] [--out <dir>] [--operator "<name>"] [--root <repo root>]
 * Exit 0 on success, 1 when the portal has no runs in that environment (nothing is written).
 */
import { userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { PortalDataError, dbPathFor, exportPortal, migrateUp, openDb } from '@pathfinder/core';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const portal = process.argv[2];
if (!portal || portal.startsWith('--') || !/^[a-z0-9][a-z0-9_-]*$/.test(portal)) {
  console.error(
    'usage: pnpm portal:export <portal> [--env <env>] [--out <dir>] [--operator "<name>"]',
  );
  process.exit(2);
}
const root = resolve(arg('root', join(import.meta.dirname, '../../..')));
const env = arg('env', 'production');
const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d+Z$/, 'Z');
const out = resolve(arg('out', join(root, 'data/exports', `${portal}-${env}-${stamp}`)));
const opened = openDb(dbPathFor(join(root, 'data'), env));
try {
  migrateUp(opened.raw, join(root, 'data/migrations'));
  const r = exportPortal({
    raw: opened.raw,
    evidenceDir: join(root, 'data/evidence'),
    portal,
    environment: env,
    outDir: out,
    operator: arg('operator', userInfo().username),
  });
  console.log(`exported ${portal} (${env}) to ${r.outDir}`);
  for (const [t, n] of Object.entries(r.counts)) console.log(`  ${t}: ${n}`);
  console.log(`  evidence files: ${r.evidenceFiles}`);
} catch (e) {
  if (!(e instanceof PortalDataError)) throw e;
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await opened.close();
}
