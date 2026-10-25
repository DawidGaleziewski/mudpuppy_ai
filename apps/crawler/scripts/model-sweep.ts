/**
 * Input sweeps on the headless driver (spec 080 FR-003, R-97 (4)): `pnpm model:sweep <portal> --env
 * <env> [--limit N] [--sweeps N]`. For each number a recorded journey typed into a field with a
 * minimum and a maximum before a page that shows values, the walk is replayed over the range and
 * every band edge is found ("1400 → 1401 changes the engine factor") and kept as a decision note
 * `input_band`, which the BA's rules pass lists. `--limit`: replays per sweep (default 40);
 * `--sweeps`: how many inputs. Each replay is one probe run through the gated tools, no LLM.
 */
import { join, resolve } from 'node:path';
import { createBrowserRuntime, openLocalClient, sweepPortal } from '@mudpuppy/mcp-server';
import { scriptEnvironment } from './script-env.js';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : undefined;
};
const valued = new Set(['--env', '--limit', '--sweeps']);
const portal = args.find((a, i) => !a.startsWith('--') && !valued.has(args[i - 1] ?? ''));
if (!portal) {
  console.error('usage: pnpm model:sweep <portal> --env <env> [--limit N] [--sweeps N]');
  process.exit(2);
}
const root = resolve(join(import.meta.dirname, '../../..'));
const environment = scriptEnvironment(root, flag('env'));
const limit = flag('limit');
const sweeps = flag('sweeps');

const local = await openLocalClient({ root, environment, runtime: createBrowserRuntime() });
try {
  const r = await sweepPortal(local.call, local.ctx.raw, portal, {
    ...(limit ? { limit: Number(limit) } : {}),
    ...(sweeps ? { sweeps: Number(sweeps) } : {}),
  });
  console.log(`${portal} (${environment}): ${String(r.replays)} probe run(s)`);
  for (const s of r.sweeps) {
    console.log(`  "${s.label}": ${String(s.replays)} value(s), ${String(s.bands.length)} edge(s)`);
    for (const b of s.bands)
      console.log(
        `    ${String(b.below)} → ${String(b.above)}: ${b.changed.map((c) => `${c.name} ${c.below} → ${c.above}`).join('; ')}`,
      );
  }
} finally {
  await local.close();
}
