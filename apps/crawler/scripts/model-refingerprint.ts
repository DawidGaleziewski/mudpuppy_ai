/**
 * Re-fingerprint a portal under another fingerprint profile, from stored snapshots (spec 039
 * T113): `pnpm model:refingerprint <portal> --env <env> --profile <name> [--root <dir>]`. The
 * profile is one of `portals/<portal>/portal.yaml`'s `fingerprint.profiles` or a built-in. Refuses
 * while a state's snapshot is missing. Then rebuilds the portal model under that profile; set
 * `fingerprint.use` to it too, or the next scan fingerprints with the old one.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadPortal, portalFingerprintProfile } from '@pathfinder/config';
import { createEvidenceStore } from '@pathfinder/core';
import {
  dbPathFor,
  migrateUp,
  openDb,
  reconcilePortalModel,
  refingerprintPortal,
} from '@pathfinder/store';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--')
    ? process.argv[i + 1]
    : undefined;
};
const portal = process.argv[2];
const env = arg('env') ?? process.env.PATHFINDER_ENV;
const name = arg('profile');
if (!portal || portal.startsWith('--') || !env || !name) {
  console.error('usage: pnpm model:refingerprint <portal> --env <env> --profile <name>');
  process.exit(2);
}
const root = resolve(arg('root') ?? join(import.meta.dirname, '../../..'));
const config = loadPortal(join(root, 'portals', portal, 'portal.yaml'), env);
const profile = portalFingerprintProfile(config, name);
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
  const r = refingerprintPortal(opened.raw, portal, profile, read);
  if (r.missing.length > 0) {
    console.error(
      `${portal} (${env}): ${r.missing.length} of ${r.states} states have no snapshot; nothing changed. ` +
        `First: ${r.missing.slice(0, 5).join(', ')}`,
    );
    process.exitCode = 1;
  } else {
    console.log(`${portal} (${env}): ${r.updated} states re-fingerprinted under ${r.profile}`);
    const m = reconcilePortalModel(opened.raw, portal, { profile: profile.id, rebuild: true });
    console.log(
      `  model version ${m.seq}: ${m.stats.screens} screens from ${m.stats.states} states`,
    );
    if (config.fingerprint.use !== name)
      console.log(
        `  portal.yaml still says fingerprint.use: ${config.fingerprint.use}; set it to ${name} for the next scans`,
      );
  }
} finally {
  await opened.close();
}
