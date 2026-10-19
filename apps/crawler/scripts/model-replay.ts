/**
 * Run the portal's waiting replays on the headless driver (spec 039 design § 8.2, § 9, § 11.5):
 * `pnpm model:replay <portal> --env <env> [--limit N] [--today YYYY-MM-DD]`. Rule R1 first (a step
 * that ended in an error, replayed twice: flaky or deterministic), then the untested boundary
 * tests of decision rules (a failed test refutes the rule, passing tests support it). Each replay
 * is one run in a fresh session through the gated tools, no LLM; `--limit` caps the runs (default:
 * the replay budget). `--today` is the day the portal counts ages from, when it is not today.
 */
import { join, resolve } from 'node:path';
import { createBrowserRuntime, openLocalClient, replayPortal } from '@pathfinder/mcp-server';
import { scriptEnvironment } from './script-env.js';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : undefined;
};
const portal = args[0];
if (!portal || portal.startsWith('--')) {
  console.error('usage: pnpm model:replay <portal> --env <env> [--limit N] [--today YYYY-MM-DD]');
  process.exit(2);
}
const root = resolve(join(import.meta.dirname, '../../..'));
const environment = scriptEnvironment(root, flag('env'));
const limit = flag('limit');
const today = flag('today');

const local = await openLocalClient({ root, environment, runtime: createBrowserRuntime() });
try {
  const r = await replayPortal(local.call, local.ctx.raw, portal, {
    ...(limit ? { limit: Number(limit) } : {}),
    ...(today ? { today } : {}),
  });
  console.log(`${portal} (${environment}): ${r.replays} replay run(s)`);
  for (const e of r.errors)
    console.log(
      `  R1 ${e.deviationId}: ${e.results.map((x) => x ?? 'diverged').join(', ')} → ${e.hypothesis ?? 'still waiting'}`,
    );
  console.log(`  ${r.tests} boundary test(s) replayed`);
  for (const m of r.moves) console.log(`  ${m.hypothesis} → ${m.to}`);
} finally {
  await local.close();
}
