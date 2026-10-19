/**
 * The labelling queue and τ calibration (spec 039 design § 6.1, T037):
 * `pnpm model:pairs <portal> --env <env> [--limit N]`. Prints the unlabelled pairs of page
 * versions nearest the τ in use (on one route, with the model's current answer) and the
 * calibration so far. Label a pair with `pnpm model:decide <portal> --by "…" label <a> <b>
 * clone|near_duplicate|distinct`; once each side has enough labels the reconciler clusters with
 * the calibrated τ.
 */
import { join, resolve } from 'node:path';
import { dbPathFor, migrateUp, openDb, pairsToLabel, tauCalibration } from '@pathfinder/store';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--')
    ? process.argv[i + 1]
    : undefined;
};
const portal = process.argv[2];
const env = arg('env') ?? process.env.PATHFINDER_ENV;
if (!portal || portal.startsWith('--') || !env) {
  console.error('usage: pnpm model:pairs <portal> --env <env> [--limit N]');
  process.exit(2);
}
const root = resolve(join(import.meta.dirname, '../../..'));
const opened = openDb(dbPathFor(join(root, 'data'), env));
try {
  migrateUp(opened.raw, join(root, 'data/migrations'));
  const c = tauCalibration(opened.raw, portal);
  console.log(
    c.tau === null
      ? `${portal} (${env}): τ not calibrated yet: ${c.same} same / ${c.distinct} distinct labels, ${c.needed} of each needed`
      : `${portal} (${env}): calibrated τ ${c.tau} (F1 ${c.f1}) from ${c.same} same / ${c.distinct} distinct labels`,
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
