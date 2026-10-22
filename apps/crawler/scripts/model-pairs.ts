/**
 * The labelling queue and τ calibration (spec 039 design § 6.1, T037):
 * `pnpm model:pairs <portal> --env <env> [--limit N]`. Prints the unlabelled pairs of page
 * versions nearest the τ in force (on one route and fingerprint profile, with the model's current
 * answer) and the calibration so far. Label a pair with `pnpm model:decide <portal> --by "…" label
 * <a> <b> clone|near_duplicate|distinct`; once each side has enough labels the calibrated τ is
 * proposed, and `pnpm model:decide … accept-tau` puts it in force (T115).
 */
import { join, resolve } from 'node:path';
import {
  acceptedTau,
  activeProfile,
  dbPathFor,
  migrateUp,
  openDb,
  pairsToLabel,
  tauCalibration,
  tauInForce,
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
  console.error('usage: pnpm model:pairs <portal> --env <env> [--limit N]');
  process.exit(2);
}
const root = resolve(join(import.meta.dirname, '../../..'));
const opened = openDb(dbPathFor(join(root, 'data'), env));
try {
  migrateUp(opened.raw, join(root, 'data/migrations'));
  const profile = activeProfile(opened.raw, portal);
  const c = tauCalibration(opened.raw, portal, profile);
  console.log(
    `${portal} (${env}, ${profile}): τ in force ${tauInForce(opened.raw, portal, profile)}` +
      (acceptedTau(opened.raw, portal, profile) ? ' (accepted)' : ' (the profile default)'),
  );
  console.log(
    c.tau === null
      ? `  not calibrated yet: ${c.same} same / ${c.distinct} distinct labels, ${c.needed} of each needed`
      : `  calibrated τ ${c.tau} (F1 ${c.f1}) from ${c.same} same / ${c.distinct} distinct labels; accept it with pnpm model:decide ${portal} --env ${env} --by "<name>" accept-tau`,
  );
  const limit = arg('limit');
  const queue = pairsToLabel(opened.raw, portal, limit ? { limit: Number(limit) } : {});
  if (queue.length === 0) console.log('  no unlabelled pair near τ');
  for (const p of queue)
    console.log(
      `  ${p.similarity.toFixed(3)} ${p.route}  ${p.a.id} "${p.a.title}" ${p.a.screen ?? '-'}  ×  ` +
        `${p.b.id} "${p.b.title}" ${p.b.screen ?? '-'}  (now ${p.sameScreen ? 'one screen' : 'two screens'})`,
    );
} finally {
  await opened.close();
}
