/**
 * Export documentation the way a rebuild team uses it (spec 034 R-68): one process as a folder, or
 * the whole portal as a folder of process folders.
 * Usage: pnpm docs:process-export <portal> [<PROC-…|PRC-…> | --portal] [--env <env>] [--out <dir>] [--root <repo root>]
 * Default out: data/exports/<portal>-<env>-<key or "portal">/, replaced on each run (only if it is
 * empty or an earlier export). Prints the folder. Exit 0 on success, 1 when there is no such
 * process, 2 on bad input. Reads the store only.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ExportError, exportPortal, exportProcess, writeExport } from '@mudpuppy/docs';
import { dbPathFor, openDb } from '@mudpuppy/store';
import { scriptEnvironment } from './script-env.js';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const USAGE =
  'usage: pnpm docs:process-export <portal> [<PROC-…|PRC-…> | --portal] [--env <env>] [--out <dir>]';
const portal = process.argv[2];
const key = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;
const whole = process.argv.includes('--portal');
if (!portal || !/^[a-z0-9][a-z0-9_-]*$/.test(portal) || (key === null) === !whole) {
  console.error(USAGE);
  process.exit(2);
}
if (key !== null && !/^(PROC|PRC)-\d{3,}$/.test(key)) {
  console.error(`not a process key: ${key} (PROC-001 or PRC-001)`);
  process.exit(2);
}
const root = resolve(arg('root', join(import.meta.dirname, '../../..')));
const env = scriptEnvironment(root, arg('env', '') || undefined);
const out = resolve(
  arg('out', join(root, 'data/exports', `${portal}-${env}-${key?.toLowerCase() ?? 'portal'}`)),
);
const path = dbPathFor(join(root, 'data'), env);
if (!existsSync(path)) {
  console.error(`no store for environment ${env}: ${path}`);
  process.exit(2);
}

const opened = openDb(path);
try {
  const opts = { environment: env, evidenceRoot: join(root, 'data', 'evidence') };
  const files =
    key === null
      ? exportPortal(opened.raw, portal, opts)
      : exportProcess(opened.raw, portal, key, opts);
  if (files === null) {
    console.error(`${portal} has no documented process ${key}`);
    process.exit(1);
  }
  writeExport(out, files);
  console.log(out);
} catch (e) {
  if (e instanceof ExportError) {
    console.error(e.message);
    process.exit(2);
  }
  throw e;
} finally {
  await opened.close();
}
