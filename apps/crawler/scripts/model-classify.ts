/**
 * Train the similarity classifier (spec 039 FR-050, T090): `pnpm model:classify <portal> --env <env>`.
 * Builds the labelled pairs of the portal's active fingerprint profile with their component
 * features, runs `pathfinder-miner classify` (apps/miner, Python: a logistic regression, every
 * fifth pair held out), and records the result after Zod validation. When it detects distinct
 * pairs better than τ on the held-out pairs, a person can accept it (`pnpm model:decide …
 * accept-classifier`); the next reconcile then clusters with it instead of τ.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  activeProfile,
  classifierTrainingSet,
  dbPathFor,
  migrateUp,
  openDb,
  recordClassifier,
} from '@pathfinder/store';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--')
    ? process.argv[i + 1]
    : undefined;
};
const portal = process.argv[2];
const env = arg('env') ?? process.env.PATHFINDER_ENV;
if (!portal || portal.startsWith('--') || !env) {
  console.error('usage: pnpm model:classify <portal> --env <env>');
  process.exit(2);
}
const root = resolve(arg('root') ?? join(import.meta.dirname, '../../..'));
const work = mkdtempSync(join(tmpdir(), 'pf-classify-'));
const opened = openDb(dbPathFor(join(root, 'data'), env));
try {
  migrateUp(opened.raw, join(root, 'data/migrations'));
  const profile = activeProfile(opened.raw, portal);
  const set = classifierTrainingSet(opened.raw, portal, profile);
  console.log(`${portal} (${env}, ${profile}): ${set.pairs.length} labelled pair(s), τ ${set.tau}`);
  const file = join(work, 'pairs.json');
  writeFileSync(file, JSON.stringify(set));
  const out = JSON.parse(
    execFileSync(
      'uv',
      ['run', '--project', join(root, 'apps/miner'), 'pathfinder-miner', 'classify', '--in', file],
      { encoding: 'utf8' },
    ),
  ) as { ok: boolean; error?: string; f1?: number; tau_f1?: number; better?: boolean };
  if (!out.ok) {
    console.log(`  not trained: ${out.error}`);
  } else {
    recordClassifier(opened.raw, portal, profile, out, set.tau);
    console.log(
      `  held-out F1 of distinct pairs: classifier ${out.f1}, τ ${out.tau_f1} → ${out.better ? `accept it with pnpm model:decide ${portal} --env ${env} --by "<name>" accept-classifier` : 'τ stays'}`,
    );
  }
} finally {
  await opened.close();
  rmSync(work, { recursive: true, force: true });
}
