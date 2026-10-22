/**
 * First-start diagnosis of a portal's environment (spec 030 R-63, field GC-02): this machine
 * (SQLite, Chromium), the environment, and the way to the portal (direct, proxy, allowlist, WAF,
 * TLS inspection). Every warning and failure names its cause and the portal-file setting that fixes it.
 * Usage: pnpm portal:doctor <portal> [--env <environment>] (`pnpm doctor` is pnpm's own command)
 * Exit 0 when nothing failed, 1 when a check failed, 2 on bad usage or an unreadable portal file.
 */
import { join, resolve } from 'node:path';
import { ConfigError, loadPortal, portalEnvironments } from '@mudpuppy/config';
import { CHECKS, formatReport, httpProbe, runChecks } from '@mudpuppy/doctor';

const args = process.argv.slice(2);
const envIdx = args.indexOf('--env');
const envArg = envIdx > -1 ? args[envIdx + 1] : undefined;
const [portalId] = args.filter(
  (a, i) => !a.startsWith('--') && (envIdx === -1 || i !== envIdx + 1),
);
const root = resolve(join(import.meta.dirname, '../../..'));

if (!portalId) {
  console.error('usage: pnpm portal:doctor <portal> [--env <environment>]');
  process.exit(2);
}
const file = join(root, 'portals', portalId, 'portal.yaml');

try {
  const declared = portalEnvironments(file).map((e) => e.environment);
  const environment =
    envArg ?? process.env.MUDPUPPY_ENV ?? (declared.length === 1 ? declared[0] : undefined);
  if (environment === undefined) {
    console.error(`${portalId} has several environments (${declared.join(', ')}): pass --env`);
    process.exit(2);
  }
  const portal = loadPortal(file, environment);
  console.log(`doctor: ${portalId} (${environment}) ${portal.base_url}\n`);
  const rows = await runChecks(CHECKS, { root, portal, environment, http: httpProbe });
  console.log(formatReport(rows));
  process.exit(rows.some((r) => r.result.status === 'fail') ? 1 : 0);
} catch (e) {
  if (!(e instanceof ConfigError)) throw e;
  console.error(e.message);
  process.exit(2);
}
