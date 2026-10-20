/**
 * Which screens two fingerprint profiles would merge or split differently (spec 039 T113):
 * `pnpm model:compare-fingerprints <portal> <profile-a> <profile-b> --env <env>`. Clusters the
 * stored snapshots of the portal under each profile (its own threshold, the pair labels as
 * constraints); reads only.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadPortal, portalFingerprintProfile } from '@pathfinder/config';
import { createEvidenceStore } from '@pathfinder/core';
import { compareProfiles, dbPathFor, migrateUp, openDb } from '@pathfinder/store';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--')
    ? process.argv[i + 1]
    : undefined;
};
const [portal, a, b] = process.argv.slice(2).filter((x, i, all) => {
  const prev = all[i - 1];
  return !x.startsWith('--') && !(prev?.startsWith('--') ?? false);
});
const env = arg('env') ?? process.env.PATHFINDER_ENV;
if (!portal || !a || !b || !env) {
  console.error(
    'usage: pnpm model:compare-fingerprints <portal> <profile-a> <profile-b> --env <env>',
  );
  process.exit(2);
}
const root = resolve(arg('root') ?? join(import.meta.dirname, '../../..'));
const config = loadPortal(join(root, 'portals', portal, 'portal.yaml'), env);
const evidence = createEvidenceStore(join(root, 'data', 'evidence'));
const read = (ref: string): string | null => {
  try {
    return readFileSync(evidence.resolve(ref), 'utf8');
  } catch {
    return null;
  }
};
const opened = openDb(dbPathFor(join(root, 'data'), env));
try {
  migrateUp(opened.raw, join(root, 'data/migrations'));
  const c = compareProfiles(
    opened.raw,
    portal,
    portalFingerprintProfile(config, a),
    portalFingerprintProfile(config, b),
    read,
  );
  const name = (id: string) => `${c.states[id]?.route ?? '?'} "${c.states[id]?.title ?? id}"`;
  const group = (g: string[]) => g.map(name).join(' + ');
  console.log(
    `${portal} (${env}): ${c.a} ${c.screens.a} screens, ${c.b} ${c.screens.b} screens; ${c.same} the same`,
  );
  for (const m of c.merged) console.log(`  merged under ${c.b}: ${m.map(group).join('  |  ')}`);
  for (const s of c.split) console.log(`  split under ${c.b}: ${s.map(group).join('  |  ')}`);
  if (c.missing.length > 0)
    console.log(`  ${c.missing.length} states left out: their snapshot is gone`);
} finally {
  await opened.close();
}
