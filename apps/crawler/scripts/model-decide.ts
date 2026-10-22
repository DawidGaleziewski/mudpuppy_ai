/**
 * A person's decisions on the portal model (spec 039 design § 10.3):
 *   pnpm model:decide <portal> --env <env> --by "<name>" confirm|reject|overturn <H-0001> --reason "…"
 *   pnpm model:decide <portal> --env <env> --by "<name>" label <state-a> <state-b> clone|near_duplicate|distinct [--reason "…"]
 *   pnpm model:decide <portal> --env <env> --by "<name>" role <route-template> <path:N|query:name> identity|data|ignored
 *   pnpm model:decide <portal> --env <env> --by "<name>" accept-tau [--profile <name@hash>]
 *   pnpm model:decide <portal> --env <env> --by "<name>" accept-classifier [--profile <name@hash>]
 * The next `model:reconcile` (or the next run) applies labels and roles as constraints, and
 * clusters with the accepted τ (spec 039 T115; per portal and fingerprint profile), or with the
 * accepted similarity classifier (owner answer 14).
 */
import { join, resolve } from 'node:path';
import {
  ModelDecisionError,
  acceptClassifier,
  acceptTau,
  dbPathFor,
  decideHypothesis,
  labelPair,
  migrateUp,
  openDb,
  setParameterRole,
} from '@mudpuppy/store';

const USAGE =
  'usage: pnpm model:decide <portal> --env <env> --by "<name>" ' +
  '(confirm|reject|overturn <key> --reason "…" | label <a> <b> <label> | role <template> <param> <role>' +
  ' | accept-tau | accept-classifier [--profile <name@hash>])';

const flags = new Set(['env', 'by', 'reason', 'root', 'profile']);
const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const positional = process.argv
  .slice(2)
  .filter((a, i, all) => !a.startsWith('--') && !(i > 0 && flags.has(all[i - 1]!.slice(2))));
const [portal, verb, ...rest] = positional;
const env = arg('env') ?? process.env.MUDPUPPY_ENV;
const by = arg('by');
if (!portal || !verb || !env || !by) {
  console.error(USAGE);
  process.exit(2);
}
const root = resolve(arg('root') ?? join(import.meta.dirname, '../../..'));
const opened = openDb(dbPathFor(join(root, 'data'), env));
try {
  migrateUp(opened.raw, join(root, 'data/migrations'));
  if (verb === 'confirm' || verb === 'reject' || verb === 'overturn') {
    const status = decideHypothesis(opened.raw, {
      portal,
      key: rest[0] ?? '',
      decision: verb,
      actor: by,
      reason: arg('reason') ?? '',
    });
    console.log(`${rest[0]}: ${status}`);
  } else if (verb === 'label') {
    const [a, b, label] = rest as [string, string, 'clone' | 'near_duplicate' | 'distinct'];
    labelPair(opened.raw, {
      portal,
      a,
      b,
      label,
      actor: by,
      ...(arg('reason') ? { reason: arg('reason')! } : {}),
    });
    console.log(`labelled ${a} / ${b}: ${label}`);
  } else if (verb === 'role') {
    const [routeTemplate, param, role] = rest as [string, string, 'identity' | 'data' | 'ignored'];
    setParameterRole(opened.raw, { portal, routeTemplate, param, role });
    console.log(`${routeTemplate} ${param}: ${role}`);
  } else if (verb === 'accept-tau') {
    const a = acceptTau(opened.raw, portal, {
      by,
      ...(arg('profile') ? { profile: arg('profile')! } : {}),
    });
    console.log(
      `${portal} (${a.profile}): τ ${a.tau} accepted (F1 ${a.f1}, ${a.labels} labels); the next reconcile clusters with it`,
    );
  } else if (verb === 'accept-classifier') {
    const a = acceptClassifier(opened.raw, portal, {
      by,
      ...(arg('profile') ? { profile: arg('profile')! } : {}),
    });
    console.log(
      `${portal} (${a.profile}): classifier accepted (F1 ${a.f1} against τ's ${a.tauF1}); the next reconcile clusters with it`,
    );
  } else {
    console.error(USAGE);
    process.exitCode = 2;
  }
} catch (e) {
  if (!(e instanceof ModelDecisionError)) throw e;
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await opened.close();
}
