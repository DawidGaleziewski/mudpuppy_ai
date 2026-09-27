import { startReferencePortal } from './server.js';

/** `pnpm reference-portal [--host <addr>] [--port <n>]`; the package script passes the loopback host. */
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

startReferencePortal({ host, port }).then((p) => {
  console.log(`reference portal listening on ${p.url}`);
});
