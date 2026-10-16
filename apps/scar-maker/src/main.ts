// `pnpm --dir apps/scar-maker start [--port 4300]`: serve every scar on 127.0.0.1 and 127.0.0.2.

import { startScarMaker } from './server.js';

const i = process.argv.indexOf('--port');
const port = i > 0 ? Number(process.argv[i + 1]) : 4300;
if (!Number.isInteger(port) || port <= 0)
  throw new Error(`--port needs a number, got ${process.argv[i + 1]}`);

const sm = await startScarMaker(port);
console.log(`scar-maker: portal ${sm.portal}, second host ${sm.second}, proxy ${sm.proxy}`);
const stop = (): void => void sm.close().then(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
