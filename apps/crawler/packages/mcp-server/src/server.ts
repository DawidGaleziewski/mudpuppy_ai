import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  createDecisionLog,
  createEvidenceStore,
  createLogger,
  dbPathFor,
  migrateUp,
  openDb,
} from '@pathfinder/core';
import type { ServerContext } from './context.js';
import type { Runtime } from './runtime.js';
import { interruptStaleRuns } from './services/index.js';
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
  const root = resolve(opts.root);
  const dataDir = join(root, 'data');
  mkdirSync(join(dataDir, 'db'), { recursive: true });
  const opened = openDb(dbPathFor(dataDir, opts.environment));
  migrateUp(opened.raw, join(dataDir, 'migrations'));
  const logger = createLogger(); // stderr: stdout belongs to the MCP protocol
  const ctx: ServerContext = {
    db: opened.db,
    raw: opened.raw,
    evidence: createEvidenceStore(join(dataDir, 'evidence')),
    decisions: createDecisionLog(opened.db, logger),
    logger,
    root,
    dbEnvironment: opts.environment,
  };
  // No browser survives a restart: anything still marked running is resumable, not live.
  await interruptStaleRuns(ctx);
  const server = createServer(ctx, opts.runtime);
  await server.connect(new StdioServerTransport());
  const shutdown = async (): Promise<void> => {
    await opts.runtime.closeAll();
    await interruptStaleRuns(ctx);
    await opened.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
