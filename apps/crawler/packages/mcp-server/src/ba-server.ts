import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createEvidenceStore, createLogger, dbPathFor, migrateUp, openDb } from '@pathfinder/core';
import { createBaServer } from './ba-tools/index.js';
import type { BaContext } from './context.js';
import { sweepStaleSessions } from './services/ba/sessions.js';

export interface BaBootOptions {
  /** Repo root holding `data/`. */
  root: string;
  /** Selects `data/db/<env>.sqlite`, the same store the crawler server of that environment writes. */
  environment: string;
}

/** Open the DB (migrated) and the evidence store, then serve the BA tools over stdio. No browser runtime. */
export async function mainBa(opts: BaBootOptions): Promise<void> {
  const root = resolve(opts.root);
  const dataDir = join(root, 'data');
  mkdirSync(join(dataDir, 'db'), { recursive: true });
  const opened = openDb(dbPathFor(dataDir, opts.environment));
  migrateUp(opened.raw, join(dataDir, 'migrations'));
  const logger = createLogger(); // stderr: stdout belongs to the MCP protocol
  const ctx: BaContext = {
    db: opened.db,
    raw: opened.raw,
    evidence: createEvidenceStore(join(dataDir, 'evidence')),
    logger,
  };
  // An agent that stopped mid-session a day ago is not coming back: leave its session resumable.
  const swept = sweepStaleSessions(ctx);
  if (swept.length > 0) logger.info({ sessions: swept }, 'stale analysis sessions interrupted');
  const server = createBaServer(ctx);
  await server.connect(new StdioServerTransport());
  const shutdown = async (): Promise<void> => {
    await opened.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
