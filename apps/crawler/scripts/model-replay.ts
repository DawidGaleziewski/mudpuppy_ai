/**
 * Run the portal's waiting replays on the headless driver (spec 039 design § 8.2, § 9, § 11.5,
 * § 11.6): `pnpm model:replay <portal> --env <env> [--limit N] [--today YYYY-MM-DD] [--regress]`.
 * Rule R1 first (a step that ended in an error, replayed twice: flaky or deterministic), then R8
 * (a confirmed rule's failed regression test, once: decision drift or flaky), then the queued
 * tests: boundary tests of new rules (a failed test refutes, passing tests support) and regression
 * rounds of confirmed rules (queued by a release on their screen; `--regress`, or `pnpm
 * model:regress`, queues every confirmed rule). Each replay is one run in a fresh session through
 * the gated tools, no LLM; `--limit` caps the runs (default: the replay budget). `--today` is the
 * day the portal counts ages from, when it is not today.
 */
import { join, resolve } from 'node:path';
import { createBrowserRuntime, openLocalClient, replayPortal } from '@mudpuppy/mcp-server';
import { scriptEnvironment } from './script-env.js';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : undefined;
};
const valued = new Set(['--env', '--limit', '--today']);
const portal = args.find((a, i) => !a.startsWith('--') && !valued.has(args[i - 1] ?? ''));
const regress = args.includes('--regress');
if (!portal) {
  console.error(
    'usage: pnpm model:replay <portal> --env <env> [--limit N] [--today YYYY-MM-DD] [--regress]',
  );
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
    regress,
  });
  console.log(`${portal} (${environment}): ${r.replays} probe run(s)`);
  for (const e of r.errors)
    console.log(
      `  R1 ${e.deviationId}: ${e.results.map((x) => x ?? 'diverged').join(', ')} → ${e.hypothesis ?? 'still waiting'}`,
    );
  if (r.regressions.length > 0) console.log(`  regression suites: ${r.regressions.join(', ')}`);
  for (const m of r.mismatches)
    console.log(`  R8 ${m.deviationId} → ${m.hypothesis ?? 'still waiting'}`);
  console.log(`  ${r.tests} boundary or regression test(s) replayed`);
  if (r.stepsSaved > 0)
    console.log(`  ${r.stepsSaved} step(s) skipped by starting where a replay got to`);
  for (const m of r.moves) console.log(`  ${m.hypothesis} → ${m.to}`);
} finally {
  await local.close();
}
