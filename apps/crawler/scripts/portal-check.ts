/**
 * Validate a portal file, and optionally a persona with it, without starting a run
 * (a typo should not cost a crawl).
 * Usage: pnpm portal:check <portal> [<persona>] [--env <environment>]
 * Exit 0 when valid, 1 with each problem named when not, 2 on bad usage.
 */
import { join, resolve } from 'node:path';
import { ConfigError, Environment, loadEffectiveConfig, loadPortal } from '@pathfinder/config';

const args = process.argv.slice(2);
const envIdx = args.indexOf('--env');
const envArg = envIdx > -1 ? args[envIdx + 1] : undefined;
const positional = args.filter(
  (a, i) => !a.startsWith('--') && (envIdx === -1 || i !== envIdx + 1),
);
const [portal, persona] = positional;
const root = resolve(join(import.meta.dirname, '../../..'));

if (!portal || (envArg !== undefined && !Environment.safeParse(envArg).success)) {
  console.error('usage: pnpm portal:check <portal> [<persona>] [--env <environment>]');
  process.exit(2);
}
const environment = envArg === undefined ? undefined : Environment.parse(envArg);
const portalPath = join(root, 'portals', portal, 'portal.yaml');

try {
  if (persona) {
    const cfg = loadEffectiveConfig(
      portalPath,
      join(root, 'personas', portal, `${persona}.yaml`),
      { fence: [join(root, 'personas/_mixins'), join(root, 'personas', portal)] },
      environment,
    );
    console.log(
      `ok: ${portal} (${cfg.portal.environment}) with ${persona}: at most ${cfg.effectiveMaxActionClass}`,
    );
  } else {
    const cfg = loadPortal(portalPath, environment);
    console.log(`ok: ${portal} (${cfg.environment}) ${cfg.base_url}`);
  }
} catch (e) {
  if (!(e instanceof ConfigError)) throw e;
  console.error(`${e.file}:`);
  for (const p of e.problems) console.error(`  - ${p}`);
  process.exit(1);
}
