/**
 * Drive a portal's named processes to their end (spec 030 R-64): every variant of a
 * `portals/<id>/traces.yaml` entry becomes one trace run (happy path, validation errors), recorded
 * like the agent's. The persona's limit decides whether the submit is pressed.
 * Usage: pnpm portal:trace <portal> <trace-id|all> <persona> [--env <env>] [--variant <id>]
 * Exit 0 when every variant reached its goal or boundary, 1 when one was abandoned, 2 on bad usage.
 */
import { join, resolve } from 'node:path';
import { ConfigError, loadPortal, loadTraces } from '@mudpuppy/config';
import {
  createBrowserRuntime,
  driveTrace,
  openLocalClient,
  suggestTraceGrouping,
} from '@mudpuppy/mcp-server';
import { scriptEnvironment } from './script-env.js';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : undefined;
};
const flagged = new Set(
  ['--env', '--variant'].flatMap((f) => [args.indexOf(f), args.indexOf(f) + 1]),
);
const [portal, traceId, persona] = args.filter((a, i) => !a.startsWith('--') && !flagged.has(i));
const root = resolve(join(import.meta.dirname, '../../..'));

if (!portal || !traceId || !persona) {
  console.error(
    'usage: pnpm portal:trace <portal> <trace-id|all> <persona> [--env <env>] [--variant <id>]',
  );
  process.exit(2);
}
const environment = scriptEnvironment(root, flag('env'));

let traces;
let baseUrl: string;
try {
  traces = loadTraces(join(root, 'portals', portal, 'traces.yaml'));
  baseUrl = loadPortal(join(root, 'portals', portal, 'portal.yaml'), environment).base_url;
} catch (e) {
  if (!(e instanceof ConfigError)) throw e;
  console.error(e.message);
  process.exit(2);
}
const chosen = traceId === 'all' ? traces : traces.filter((t) => t.id === traceId);
if (chosen.length === 0) {
  console.error(
    `no trace "${traceId}" in portals/${portal}/traces.yaml (${traces.map((t) => t.id).join(', ') || 'none'})`,
  );
  process.exit(2);
}

const local = await openLocalClient({ root, environment, runtime: createBrowserRuntime() });
let abandoned = false;
try {
  for (const trace of chosen) {
    if (trace.to_be_discovered) {
      console.log(`skip  ${trace.id}: to be discovered (no steps yet)`);
      continue;
    }
    const results = await driveTrace(
      local.call,
      { portal, persona, baseUrl },
      trace,
      flag('variant'),
    );
    for (const r of results) {
      abandoned ||= r.outcome === 'abandoned';
      console.log(
        `${r.outcome.padEnd(16)} ${r.trace}/${r.variant}: ${String(r.steps)} step(s), run ${r.runId ?? '-'}${r.reason ? ` — ${r.reason}` : ''}`,
      );
    }
    // The variants as one process for the BA to accept in Processes (spec 031 US5).
    const g = suggestTraceGrouping(local.ctx, { portal, persona, trace }, results);
    console.log(
      'suggested' in g
        ? `grouping       ${trace.id}: suggested "${g.suggested.name}" (${String(g.suggested.steps.length)} screens), accept it in Processes`
        : `grouping       ${trace.id}: not suggested, ${g.skipped}`,
    );
  }
} finally {
  await local.close();
}
process.exit(abandoned ? 1 : 0);
