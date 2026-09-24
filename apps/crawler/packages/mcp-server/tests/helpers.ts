import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
import {
  createDecisionLog,
  createEvidenceStore,
  createLogger,
  migrateUp,
  newId,
  nowIso,
  openDb,
  type OpenedDb,
} from '@pathfinder/core';
import type { ServerContext } from '../src/context.js';

const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

export async function makeCtx(): Promise<ServerContext & { dir: string; opened: OpenedDb }> {
  const dir = mkdtempSync(join(tmpdir(), 'pf-mcp-'));
  const opened = openDb(':memory:');
  migrateUp(opened.raw, MIGRATIONS);
  const logger = createLogger({ level: 'silent' });
  cleanups.push(async () => {
    await opened.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    db: opened.db,
    raw: opened.raw,
    evidence: createEvidenceStore(join(dir, 'evidence')),
    decisions: createDecisionLog(opened.db, logger),
    logger,
    root: dir,
    dbEnvironment: 'production',
    // No test reaches the network: robots.txt answers 404 (no rules) unless a test overrides it.
    fetch: (async () => new Response('', { status: 404 })) as typeof fetch,
    dir,
    opened,
  };
}

export async function seedRun(
  ctx: ServerContext,
  over: Partial<{
    environment: string;
    status: 'running' | 'completed' | 'stopped_warning' | 'interrupted';
    warning: string | null;
    scope: object;
    portal: string;
  }> = {},
): Promise<string> {
  const id = newId();
  await ctx.db
    .insertInto('runs')
    .values({
      id,
      portal_id: over.portal ?? 'shop',
      persona_id: 'guest',
      mode: 'map',
      environment: over.environment ?? 'production',
      env_version_or_date: '2026-09-23',
      seed_id: null,
      viewport: '1366x768',
      locale: 'pl-PL',
      browser: 'chromium',
      config_snapshot: JSON.stringify({ scope: over.scope ?? {} }),
      status: over.status ?? 'running',
      warning: over.warning ?? null,
      steps_used: 0,
      elapsed_ms: 0,
      max_depth_reached: 0,
      started_at: nowIso(),
      ended_at: null,
      coverage: null,
    })
    .execute();
  return id;
}

export const REF = 'a'.repeat(64) + '.yaml';
export const FP = (c: string) => c.repeat(64);
