/**
 * Export the portal's decision rules (spec 039 design § 11.4, owner answer OV-5):
 * `pnpm model:rules-export <portal> --env <env> [--root <dir>] [--out <dir>] [--status confirmed,supported|all]`.
 * Writes per rule in those statuses (default: confirmed and supported) a DMN 1.3 table
 * `<key>.dmn` and a Markdown page `<key>.md` (the sentence, then the table), `rules.csv` of them
 * all and a `README.md` index. A rule is named by its BR key once the BA documented it. `--root`:
 * the folder holding `data/` (default: the repo). Default out: `data/exports/<portal>-<env>-rules/`,
 * replaced on each run.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ALL_RULE_STATUSES,
  dbPathFor,
  EXPORTED_RULE_STATUSES,
  migrateUp,
  openDb,
  ruleFiles,
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
  console.error(
    'usage: pnpm model:rules-export <portal> --env <env> [--root <dir>] [--out <dir>] [--status confirmed,supported|all]',
  );
  process.exit(2);
}
const repo = resolve(join(import.meta.dirname, '../../..'));
const root = resolve(arg('root') ?? repo);
const out = resolve(arg('out') ?? join(root, 'data/exports', `${portal}-${env}-rules`));
const status = arg('status');
const statuses = (
  status === 'all' ? ALL_RULE_STATUSES : (status?.split(',') ?? EXPORTED_RULE_STATUSES)
) as Parameters<typeof ruleFiles>[2];
const opened = openDb(dbPathFor(join(root, 'data'), env));
try {
  // The repo's own store is brought up to date; another (`--root`, the dashboard's) is only read.
  if (root === repo) migrateUp(opened.raw, join(repo, 'data/migrations'));
  const files = ruleFiles(opened.raw, portal, statuses);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const f of files) writeFileSync(join(out, f.path), f.content);
  console.log(`${out}: ${(files.length - 2) / 2} rule(s)`);
} finally {
  await opened.close();
}
