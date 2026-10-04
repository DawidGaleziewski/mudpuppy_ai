/**
 * Export a portal's documentation as an SRS folder (specs/004 contracts/srs-export.md; FR-050–FR-054).
 * Usage: pnpm docs:export <portal> [--env production] [--confirmed-only] [--out <dir>] [--operator "<name>"] [--root <repo root>]
 * Default out: data/exports/<portal>-<env>-srs/, replaced on each run (only if it is empty or an
 * earlier export). Exit 0 on success, 1 when the portal has no documentation records, 2 on bad
 * input (usage, missing store, an out folder that is not an earlier export).
 */
import { existsSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { dbPathFor, newId, nowIso, openDb } from '@pathfinder/core';
import { ExportError, exportSrs, writeExport } from '@pathfinder/docs';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const portal = process.argv[2];
if (!portal || portal.startsWith('--') || !/^[a-z0-9][a-z0-9_-]*$/.test(portal)) {
  console.error(
    'usage: pnpm docs:export <portal> [--env <env>] [--confirmed-only] [--out <dir>] [--operator "<name>"]',
  );
  process.exit(2);
}
const root = resolve(arg('root', join(import.meta.dirname, '../../..')));
const env = arg('env', 'production');
const confirmedOnly = process.argv.includes('--confirmed-only');
const out = resolve(arg('out', join(root, 'data/exports', `${portal}-${env}-srs`)));
const path = dbPathFor(join(root, 'data'), env);
if (!existsSync(path)) {
  console.error(`no store for environment ${env}: ${path}`);
  process.exit(2);
}

const opened = openDb(path);
try {
  const files = exportSrs(opened.raw, portal, {
    environment: env,
    confirmedOnly,
    evidenceRoot: join(root, 'data', 'evidence'),
  });
  writeExport(out, files);
  const records = (
    JSON.parse(files.get('records.json') as string) as { records: { kind: string }[] }
  ).records;
  const counts: Record<string, number> = {};
  for (const r of records) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  // The only write: the operator log row, as portal:export and portal:delete leave.
  opened.raw
    .prepare(
      `INSERT INTO portal_data_log (id, portal_id, environment, action, operator, counts_json, target, created_at)
       VALUES (?, ?, ?, 'export', ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      portal,
      env,
      arg('operator', userInfo().username),
      JSON.stringify({ srs: confirmedOnly ? 'confirmed' : 'all', records: counts }),
      out,
      nowIso(),
    );
  console.log(
    `exported the SRS of ${portal} (${env}, ${confirmedOnly ? 'confirmed only' : 'all, drafts marked'}) to ${out}`,
  );
  console.log(`  files: ${files.size}, records: ${records.length}`);
} catch (e) {
  if (!(e instanceof ExportError)) throw e;
  console.error(e.message);
  process.exitCode = e.code === 'NO_RECORDS' ? 1 : 2;
} finally {
  await opened.close();
}
