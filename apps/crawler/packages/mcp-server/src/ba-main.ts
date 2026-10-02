import { fileURLToPath } from 'node:url';
import { mainBa } from './ba-server.js';

// packages/mcp-server/src -> repo root is five levels up.
const root =
  process.env.PATHFINDER_ROOT ?? fileURLToPath(new URL('../../../../..', import.meta.url));

mainBa({
  root,
  environment: process.env.PATHFINDER_ENV ?? 'production',
}).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
