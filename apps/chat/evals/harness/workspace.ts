/**
 * A fresh workspace per trial: the portal's config, the migrations and a copy of the source
 * store with every grouping taken out, so the assistant starts where a person stands after the
 * scans and before the narrow step. The source store is never written.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newId, nowIso } from '@mudpuppy/core';
import { migrateUp, openDb } from '@mudpuppy/store';
import type { EvalConfig } from '../config.js';
import { die } from '../failures.js';

/** Everything that says how the portal is cut into processes, children first (foreign keys). */
const GROUPING_TABLES = [
  // spec 039: what the model derived per process (T070, T073, T075)
  'process_triggers',
  'process_explorations',
  'process_instances',
  'grouping_suggestions',
  'change_spec_revisions',
  'process_live',
  'process_drafts',
  'process_model_revisions',
  'process_models',
  'ba_process_revisions',
  'ba_processes',
  'process_scopes',
] as const;

export interface Workspace {
  dir: string;
  storePath: string;
  conversationId: string;
  remove: () => void;
}

export function sourceStore(config: EvalConfig): string {
  return join(config.store, 'data', 'db', `${config.env}.sqlite`);
}

export function createWorkspace(config: EvalConfig): Workspace {
  const source = sourceStore(config);
  if (!existsSync(source)) die(`no store at ${source}`);
  const dir = mkdtempSync(join(tmpdir(), `pf-grouping-${config.portal}-`));
  const remove = () => rmSync(dir, { recursive: true, force: true });
  cpSync(join(config.root, 'portals', config.portal), join(dir, 'portals', config.portal), {
    recursive: true,
  });
  cpSync(join(config.root, 'data', 'migrations'), join(dir, 'data', 'migrations'), {
    recursive: true,
  });
  mkdirSync(join(dir, 'data', 'db'), { recursive: true });
  const storePath = join(dir, 'data', 'db', `${config.env}.sqlite`);
  const from = openDb(source);
  // A consistent copy even when the source still has a write-ahead log; the source is only read.
  from.raw.exec(`VACUUM INTO '${storePath.replaceAll("'", "''")}'`);
  from.raw.close();
  const conversationId = newId();
  const { raw } = openDb(storePath);
  // Migrated first, while its keys are whole: a migration newer than the source store refuses to
  // run over the dangling keys the cut below leaves (spec 045 F-03).
  migrateUp(raw, join(dir, 'data', 'migrations'));
  // A PROC record must name its process (spec 039 T070) and the grouping tools never read records:
  // in this throwaway copy the BA's PROC records keep the id of a process taken out.
  raw.pragma('foreign_keys = OFF');
  raw.transaction(() => {
    for (const t of GROUPING_TABLES) raw.prepare(`DELETE FROM ${t}`).run();
    raw
      .prepare(
        `INSERT INTO chat_conversations (id, portal_id, goal, created_at, updated_at)
         VALUES (?, ?, '', ?, ?)`,
      )
      .run(conversationId, config.portal, nowIso(), nowIso());
  })();
  raw.close();
  writeFileSync(join(dir, '.mcp.json'), JSON.stringify(mcpConfig(config, dir, conversationId)));
  return { dir, storePath, conversationId, remove };
}

/** Only the chat's own MCP server, on the workspace (as session-config.ts starts it). */
function mcpConfig(config: EvalConfig, dir: string, conversationId: string) {
  return {
    mcpServers: {
      'mudpuppy-chat': {
        command: 'pnpm',
        args: ['--dir', join(config.root, 'apps', 'chat'), 'run', 'mcp'],
        env: {
          MUDPUPPY_ENV: config.env,
          MUDPUPPY_ROOT: dir,
          MUDPUPPY_CHAT_CONVERSATION: conversationId,
        },
      },
    },
  };
}
