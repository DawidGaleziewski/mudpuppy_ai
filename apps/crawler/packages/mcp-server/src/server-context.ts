// What a running mudpuppy server stands on: the environment's store (migrated), the evidence
// store, the tracer and the decision log, registered with the data directory's server registry.
// Shared by the stdio server and the in-process client the trace driver uses (spec 030 R-64).

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvidenceStore, createLogger, newId, type Logger } from '@mudpuppy/core';
import {
  createDecisionLog,
  createTracer,
  dbPathFor,
  linkDecisions,
  migrateUp,
  openDb,
  uvMiner,
} from '@mudpuppy/store';
import type { ServerContext } from './context.js';
import { interruptStaleRuns } from './services/index.js';
import { registerServer } from './services/server-registry.js';
import { serverVersion, traceConfigFromEnv } from './trace-config.js';

export interface OpenedServerContext {
  ctx: ServerContext;
  /** Leave the registry, stop the tracer and close the store (runs are interrupted first). */
  close(): Promise<void>;
}

export async function openServerContext(opts: {
  root: string;
  environment: string;
  logger?: Logger;
  /** Mine business rules after each run's rebuild when the miner is installed (the MCP server). */
  mine?: boolean;
}): Promise<OpenedServerContext> {
  const root = resolve(opts.root);
  const dataDir = join(root, 'data');
  mkdirSync(join(dataDir, 'db'), { recursive: true });
  const opened = openDb(dbPathFor(dataDir, opts.environment));
  migrateUp(opened.raw, join(dataDir, 'migrations'));
  const logger = opts.logger ?? createLogger(); // stderr: stdout belongs to the MCP protocol
  const evidence = createEvidenceStore(join(dataDir, 'evidence'));
  const trace = traceConfigFromEnv(process.env);
  if (trace.invalidLevel)
    logger.warn({ value: trace.invalidLevel }, 'unknown MUDPUPPY_TRACE_LEVEL, using standard');
  const tracer = createTracer({ db: opened.db, logger, evidence, level: trace.level });
  await tracer.start({
    environment: opts.environment,
    server: 'mudpuppy',
    version: serverVersion(root),
  });
  const ctx: ServerContext = {
    owner: { id: newId(), pid: process.pid },
    db: opened.db,
    raw: opened.raw,
    evidence,
    decisions: linkDecisions(createDecisionLog(opened.db, logger), tracer),
    logger,
    tracer,
    root,
    dbEnvironment: opts.environment,
    miner: opts.mine ? uvMiner(root) : null,
  };
  // Stray servers on this data directory (another environment, another checkout) are named at
  // start (spec 030 R-61, field GC-22).
  const registered = registerServer(dataDir, {
    pid: process.pid,
    environment: opts.environment,
    codeRoot: fileURLToPath(new URL('../../../../..', import.meta.url)),
    server: 'mudpuppy',
    startedAt: new Date().toISOString(),
  });
  for (const w of registered.warnings)
    logger.warn({ stray_server: w }, 'another server shares this data directory');
  // No browser survives its server: a running run whose server is gone is resumable, not live.
  // Runs of other live servers on the same store are left alone (F-14).
  await interruptStaleRuns(ctx, 'startup');
  await tracer.sweepUnfinished();
  return {
    ctx,
    close: async () => {
      registered.unregister();
      await interruptStaleRuns(ctx, 'shutdown');
      await tracer.shutdown();
      await opened.close();
    },
  };
}
