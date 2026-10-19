/**
 * Run the portal's untested boundary tests on the headless driver (spec 039 design § 9, § 11.5):
 * `pnpm model:replay <portal> --env <env> [--limit N] [--today YYYY-MM-DD]`. Each test is one
 * replay run of the latest recorded execution of its decision point, with the test's inputs, in a
 * fresh session through the gated tools (no LLM). Every finished run reconciles the model; then
 * the tests get their verdicts and the rules move (a failed test refutes, passing tests support).
 * `--today` is the day the portal counts ages from, when it is not today (a test portal).
 */
import { join, resolve } from 'node:path';
import { createBrowserRuntime, openLocalClient, replay } from '@pathfinder/mcp-server';
import { judgeReplays, pendingReplays, recordReplay } from '@pathfinder/store';
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
  const plans = pendingReplays(local.ctx.raw, portal, {
    ...(limit ? { limit: Number(limit) } : {}), // default: the replay budget (MODEL_DEFAULTS)
    ...(today ? { today } : {}),
  });
  console.log(`${portal} (${environment}): ${plans.length} boundary test(s) to replay`);
  for (const plan of plans) {
    const outcome = await replay(local.call, plan);
    recordReplay(local.ctx.raw, plan.testId, outcome);
    console.log(
      `  ${plan.hypothesis} ${JSON.stringify(plan.inputs)}: ${outcome.status}` +
        (outcome.status === 'diverged' ? ` (${outcome.reason})` : ` run ${outcome.runId}`),
    );
  }
  for (const m of judgeReplays(local.ctx.raw, portal)) console.log(`  ${m.hypothesis} → ${m.to}`);
} finally {
  await local.close();
}
