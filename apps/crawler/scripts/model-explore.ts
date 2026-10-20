/**
 * Explore processes to the stopping rule (spec 039 design § 14.2, T075):
 * `pnpm model:explore <portal> [PRC-…] --env <env> [--walks N] [--length N] [--seed N] [--limit N]`.
 * One pass per process on the headless driver: every action class of its screens once per persona
 * (depth 1), every pair of consecutive classes once (depth 2), then random walks inside it. Without
 * a process key it explores every process not yet explored on the current build epochs (planner
 * priority 6). Each replay is one probe run through the gated tools, no LLM; `--limit` caps them.
 */
import { join, resolve } from 'node:path';
import { createBrowserRuntime, exploreProcess, openLocalClient } from '@pathfinder/mcp-server';
import { unexploredProcesses } from '@pathfinder/store';
import { scriptEnvironment } from './script-env.js';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : undefined;
};
const valued = new Set(['--env', '--walks', '--length', '--seed', '--limit']);
const positional = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1] ?? ''));
const [portal, only] = positional;
if (!portal) {
  console.error(
    'usage: pnpm model:explore <portal> [PRC-…] --env <env> [--walks N] [--length N] [--seed N] [--limit N]',
  );
  process.exit(2);
}
const root = resolve(join(import.meta.dirname, '../../..'));
const environment = scriptEnvironment(root, flag('env'));
const num = (name: string) => (flag(name) === undefined ? {} : { [name]: Number(flag(name)) });

const local = await openLocalClient({ root, environment, runtime: createBrowserRuntime() });
try {
  const keys = only ? [only] : unexploredProcesses(local.ctx.raw, portal);
  if (keys.length === 0) console.log(`${portal} (${environment}): every process is explored`);
  for (const key of keys) {
    const r = await exploreProcess(local.call, local.ctx.raw, portal, key, {
      ...num('walks'),
      ...(flag('length') ? { walkLength: Number(flag('length')) } : {}),
      ...num('seed'),
      ...num('limit'),
    });
    if (!r) {
      console.log(`  ${key}: no as-is model to explore`);
      continue;
    }
    console.log(
      `  ${key}: ${r.replays} replay(s), ${r.diverged} diverged, ${r.newDeviations} new deviation(s)`,
    );
    if (r.unreachable.length > 0)
      console.log(
        `    no recorded way to ${r.unreachable.length} gap(s): a focused map run is needed`,
      );
    if (r.bound) console.log(`    ${r.bound}`);
    else console.log('    the pass was not complete: not recorded as explored');
  }
} finally {
  await local.close();
}
