/**
 * The eval's workspace and ground truth (spec 009 R-27; moved out of `eval-run.ts` in spec 014
 * T005 to keep the script under G-01).
 */
import { cpSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dbPathFor, migrateUp, openDb } from '@pathfinder/store';

/**
 * A fresh workspace with copies of portals/, personas/ and the migrations, so the developer's
 * store is never touched. The portal's credential rows are copied in (they stay encrypted; the
 * same vault key opens them).
 */
export function createWorkspace(root: string, portal: string, env: string): string {
  const ws = mkdtempSync(join(tmpdir(), `pf-eval-${portal}-`));
  cpSync(join(root, 'portals'), join(ws, 'portals'), { recursive: true });
  cpSync(join(root, 'personas'), join(ws, 'personas'), { recursive: true });
  cpSync(join(root, 'data', 'migrations'), join(ws, 'data', 'migrations'), { recursive: true });
  const main = dbPathFor(join(root, 'data'), env);
  const target = openDb(dbPathFor(join(ws, 'data'), env));
  migrateUp(target.raw, join(ws, 'data', 'migrations'));
  if (existsSync(main)) {
    const src = openDb(main);
    // A store not yet migrated to 0007 has no credentials to copy (and is not migrated from here).
    const hasTable = src.raw
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'credentials'")
      .get();
    const rows = !hasTable
      ? []
      : (src.raw
          .prepare('SELECT * FROM credentials WHERE portal_id = ? AND environment = ?')
          .all(portal, env) as Record<string, unknown>[]);
    const insert = target.raw.prepare(
      `INSERT INTO credentials (id, portal_id, environment, ref_name, ciphertext, nonce, key_id, created_at, updated_at)
       VALUES (@id, @portal_id, @environment, @ref_name, @ciphertext, @nonce, @key_id, @created_at, @updated_at)`,
    );
    for (const r of rows) insert.run(r);
    void src.close(); // fire-and-forget: read-only copy source, the process exit ends it anyway
  }
  void target.close(); // fire-and-forget: the workspace store reopens later, SQLite WAL is durable
  return ws;
}

/** The ground-truth file of a portal, or null when none is known. */
export function groundTruthPath(root: string, portal: string): string | null {
  if (portal === 'reference-insurer')
    return join(root, 'apps/crawler/packages/reference-portal/ground-truth.json');
  const m = /^proving-ground-(shop|bank|insurer)$/.exec(portal);
  return m ? join(root, 'apps/proving-ground/ground-truth', `${m[1]}.json`) : null;
}
