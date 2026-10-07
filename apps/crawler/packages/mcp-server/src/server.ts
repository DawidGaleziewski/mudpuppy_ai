import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  createDecisionLog,
  createEvidenceStore,
  createLogger,
  createTracer,
  dbPathFor,
  linkDecisions,
  migrateUp,
  newId,
  openDb,
} from '@pathfinder/core';
import type { ServerContext } from './context.js';
import type { Runtime } from './runtime.js';
import { interruptStaleRuns } from './services/index.js';
import { createServer } from './tools/index.js';
import { serverVersion, traceConfigFromEnv } from './trace-config.js';

export interface BootOptions {
  /** Repo root holding `portals/`, `personas/`, `data/`, `.mcp.json`. */
  root: string;
  /** Selects `data/db/<env>.sqlite`; `start_run` refuses portals of another environment. */
  environment: string;
  runtime: Runtime;
}

/** Open the DB (migrated), evidence store and logger, then serve the tools over stdio. */
export async function main(opts: BootOptions): Promise<void> {
  const root = resolve(opts.root);
  const dataDir = join(root, 'data');
  mkdirSync(join(dataDir, 'db'), { recursive: true });
  const opened = openDb(dbPathFor(dataDir, opts.environment));
  migrateUp(opened.raw, join(dataDir, 'migrations'));
  const logger = createLogger(); // stderr: stdout belongs to the MCP protocol
  const evidence = createEvidenceStore(join(dataDir, 'evidence'));
  const trace = traceConfigFromEnv(process.env);
  if (trace.invalidLevel)
    logger.warn({ value: trace.invalidLevel }, 'unknown PATHFINDER_TRACE_LEVEL, using standard');
  const tracer = createTracer({ db: opened.db, logger, evidence, level: trace.level });
  await tracer.start({
    environment: opts.environment,
    server: 'pathfinder',
    version: serverVersion(root),
    pwTrace: trace.pwTrace,
  });
  const ctx: ServerContext = {
    owner: { id: newId(), pid: process.pid },
    db: opened.db,
    raw: opened.raw,
    evidence,
    decisions: linkDecisions(createDecisionLog(opened.db, logger), tracer),
    logger,
    tracer,
    pwTrace: trace.pwTrace,
    root,
    dbEnvironment: opts.environment,
  };
  // No browser survives its server: a running run whose server is gone is resumable, not live.
  // Runs of other live servers on the same store are left alone (F-14).
  await interruptStaleRuns(ctx, 'startup');
  await tracer.sweepUnfinished();
  const server = createServer(ctx, opts.runtime);
  await server.connect(new StdioServerTransport());
  let closing: Promise<void> | null = null;
  const shutdown = (): Promise<void> =>
    (closing ??= (async () => {
      await opts.runtime.closeAll();
      await interruptStaleRuns(ctx, 'shutdown');
      await tracer.shutdown();
      await opened.close();
      process.exit(0);
    })());
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.once('SIGHUP', shutdown);
  // The client going away closes stdin. An open browser would keep this process (and Chromium)
  // alive forever after the chat service stopped (spec 010 F-19), so stdin's end shuts down too.
  process.stdin.once('end', shutdown);
  process.stdin.once('close', shutdown);
}
