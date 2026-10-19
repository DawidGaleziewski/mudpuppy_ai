/**
 * Export the portal's decision rules as DMN 1.3 (spec 039 design § 11.4):
 * `pnpm model:dmn <portal> --env <env> [--out <dir>] [--status confirmed,supported]`. Writes one
 * `<H-key>.dmn` per rule in those statuses (default: confirmed and supported) and a `README.md`
 * index with each rule's status, fit and boundary-test verdicts. Default out:
 * `data/exports/<portal>-<env>-rules/`, replaced on each run.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dbPathFor, dmnFiles, EXPORTED_RULE_STATUSES, migrateUp, openDb } from '@pathfinder/store';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--')
    ? process.argv[i + 1]
    : undefined;
};
const portal = process.argv[2];
const env = arg('env') ?? process.env.PATHFINDER_ENV;
if (!portal || portal.startsWith('--') || !env) {
  console.error(
    'usage: pnpm model:dmn <portal> --env <env> [--out <dir>] [--status confirmed,supported]',
  );
  process.exit(2);
}
const root = resolve(join(import.meta.dirname, '../../..'));
const out = resolve(arg('out') ?? join(root, 'data/exports', `${portal}-${env}-rules`));
const statuses = (arg('status')?.split(',') ?? [...EXPORTED_RULE_STATUSES]) as Parameters<
  typeof dmnFiles
>[2];
const opened = openDb(dbPathFor(join(root, 'data'), env));
try {
  migrateUp(opened.raw, join(root, 'data/migrations'));
  const files = dmnFiles(opened.raw, portal, statuses);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const f of files) writeFileSync(join(out, f.path), f.content);
  console.log(`${out}: ${files.length - 1} rule(s)`);
} finally {
  await opened.close();
}
