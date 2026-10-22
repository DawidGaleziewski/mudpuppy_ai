import { fileURLToPath } from 'node:url';
import { bootEnvironment } from './boot-environment.js';
import { mainBa } from './ba-server.js';

// packages/mcp-server/src -> repo root is five levels up.
const root = process.env.MUDPUPPY_ROOT ?? fileURLToPath(new URL('../../../../..', import.meta.url));

mainBa({
  root,
  environment: bootEnvironment(root),
}).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
