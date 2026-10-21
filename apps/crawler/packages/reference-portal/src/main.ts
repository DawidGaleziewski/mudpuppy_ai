import { parseScenarios } from './scenarios.js';
import { startReferencePortal } from './server.js';

/**
 * `pnpm reference-portal [--host <addr>] [--port <n>]`; the package script passes the loopback host.
 * `REFERENCE_SCENARIOS=a,b` switches on switchboard scenarios (spec 039 design § 19.1).
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const host = arg('host') ?? process.env.REFERENCE_PORTAL_HOST;
if (!host) {
  console.error('reference-portal: pass --host (the package script binds the loopback address)');
  process.exit(2);
}
const port = Number(arg('port') ?? process.env.REFERENCE_PORTAL_PORT ?? 4010);

let scenarios;
try {
  scenarios = parseScenarios(process.env.REFERENCE_SCENARIOS);
} catch (err) {
  console.error(`reference-portal: ${(err as Error).message}`);
  process.exit(2);
}

startReferencePortal({ host, port, scenarios }).then(
  (p) => console.log(`reference portal listening on ${p.url}`),
  (err: unknown) => {
    console.error('reference-portal: could not start:', err);
    process.exit(1);
  },
);
