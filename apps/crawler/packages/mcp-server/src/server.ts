import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Runtime } from './runtime.js';
import { openServerContext } from './server-context.js';
import { createServer } from './tools/index.js';

export interface BootOptions {
  /** Repo root holding `portals/`, `personas/`, `data/`, `.mcp.json`. */
  root: string;
  /** Selects `data/db/<env>.sqlite`; `start_run` refuses portals of another environment. */
  environment: string;
  runtime: Runtime;
}

/** Open the DB (migrated), evidence store and logger, then serve the tools over stdio. */
export async function main(opts: BootOptions): Promise<void> {
  const opened = await openServerContext({ ...opts, mine: true });
  const server = createServer(opened.ctx, opts.runtime);
  await server.connect(new StdioServerTransport());
  let closing: Promise<void> | null = null;
  const shutdown = (): Promise<void> =>
    (closing ??= (async () => {
      await opts.runtime.closeAll();
      await opened.close();
      process.exit(0);
    })());
  // Listeners ignore the returned promise; a shutdown that throws must still end the process (G-21).
  const onExit = (): void => {
    shutdown().catch(() => process.exit(1));
  };
  process.once('SIGINT', onExit);
  process.once('SIGTERM', onExit);
  process.once('SIGHUP', onExit);
  // The client going away closes stdin. An open browser would keep this process (and Chromium)
  // alive forever after the chat service stopped (spec 010 F-19), so stdin's end shuts down too.
  process.stdin.once('end', onExit);
  process.stdin.once('close', onExit);
}
