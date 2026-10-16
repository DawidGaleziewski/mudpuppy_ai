/**
 * Read-only integrity check of the documentation records (specs/004 contracts/operator-cli.md; SC-001, SC-002).
 * Usage: pnpm docs:audit [<portal>] [--env production] [--root <repo root>]
 * Prints a JSON report. Exit 0 when clean, 1 on any finding, 2 when the store cannot be audited.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { audit, elementKeysReader, qualityFindings } from '@pathfinder/docs';
import { dbPathFor, openDb } from '@pathfinder/store';
import { scriptEnvironment } from './script-env.js';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const first = process.argv[2];
const portal = first && !first.startsWith('--') ? first : undefined;
if (portal !== undefined && !/^[a-z0-9][a-z0-9_-]*$/.test(portal)) {
  console.error('usage: pnpm docs:audit [<portal>] [--env <env>]');
  process.exit(2);
}
const root = resolve(arg('root', join(import.meta.dirname, '../../..')));
const env = scriptEnvironment(root, arg('env', '') || undefined);
const path = dbPathFor(join(root, 'data'), env);
if (!existsSync(path)) {
  console.error(`no store for environment ${env}: ${path}`);
  process.exit(2);
}

const opened = openDb(path);
try {
  // The audit never writes; make the connection refuse to.
  opened.raw.pragma('query_only = ON');
  const hasDocs = opened.raw
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'doc_records'")
    .get();
  if (!hasDocs) {
    console.error(`${path} has no documentation tables yet; start a server once to migrate it`);
    process.exitCode = 2;
  } else {
    const report = audit(opened.raw, portal, {
      elementKeysOf: elementKeysReader(opened.raw, join(root, 'data', 'evidence')),
    });
    // Quality flags (spec 030 R-65) are printed beside the integrity report; they never fail it.
    console.log(
      JSON.stringify({ ...report, quality: qualityFindings(opened.raw, portal) }, null, 2),
    );
    if (!report.ok) process.exitCode = 1;
  }
} finally {
  await opened.close();
}
