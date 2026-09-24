import type BetterSqlite3 from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nowIso } from './ids.js';

const FILE = /^(\d{4})_([a-z0-9_]+)\.(up|down)\.sql$/;

export interface Migration {
  version: string;
  name: string;
  up: string;
  down: string;
}

/** Read `NNNN_name.up.sql` / `.down.sql` pairs from a directory, ordered by version. Every up needs a down. */
export function loadMigrations(dir: string): Migration[] {
  const byVersion = new Map<string, Partial<Migration>>();
  for (const file of readdirSync(dir)) {
    const m = FILE.exec(file);
    if (!m) continue;
    const [, version, name, dir_] = m as unknown as [string, string, string, 'up' | 'down'];
    const entry = byVersion.get(version) ?? { version, name };
    if (entry.name !== name)
      throw new Error(`migration ${version} has two names: ${entry.name}, ${name}`);
    entry[dir_] = readFileSync(join(dir, file), 'utf8');
    byVersion.set(version, entry);
  }
  return [...byVersion.values()]
    .sort((a, b) => (a.version! < b.version! ? -1 : 1))
    .map((e) => {
      if (e.up === undefined || e.down === undefined)
        throw new Error(`migration ${e.version}_${e.name} needs both .up.sql and .down.sql`);
      return e as Migration;
    });
}

function ensureBookkeeping(raw: BetterSqlite3.Database): void {
  raw.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    TEXT PRIMARY KEY,
       name       TEXT NOT NULL,
       applied_at TEXT NOT NULL
     ) STRICT`,
  );
}

export function appliedVersions(raw: BetterSqlite3.Database): string[] {
  ensureBookkeeping(raw);
  return (
    raw.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
      version: string;
    }[]
  ).map((r) => r.version);
}

/**
 * Apply one migration's SQL in a transaction, with bookkeeping done inside the same transaction.
 *
 * `PRAGMA foreign_keys` is a no-op inside a transaction in SQLite, and with it ON, `DROP TABLE` of a
 * table other tables reference by foreign key fails as if every child row were orphaned (SQLite runs
 * FK enforcement against the implicit delete-all a DROP performs). Table-rebuild migrations (the
 * "12 steps" CREATE-copy-DROP-RENAME dance) need it OFF for the duration. So: turn it off before the
 * transaction starts, run the migration and a `PRAGMA foreign_key_check` inside the transaction (a
 * plain integrity query, unaffected by the pragma's own transaction restriction) so a dangling
 * reference aborts the whole migration instead of committing broken data, then always restore the
 * pragma to what it was.
 */
function applyMigration(raw: BetterSqlite3.Database, sql: string, bookkeeping: () => void): void {
  const wasOn = raw.pragma('foreign_keys', { simple: true }) === 1;
  if (wasOn) raw.pragma('foreign_keys = OFF');
  try {
    raw.transaction(() => {
      raw.exec(sql);
      const violations = raw.pragma('foreign_key_check') as unknown[];
      if (violations.length > 0)
        throw new Error(`migration left dangling foreign keys: ${JSON.stringify(violations)}`);
      bookkeeping();
    })();
  } finally {
    if (wasOn) raw.pragma('foreign_keys = ON');
  }
}

/** Apply every pending migration, each in its own transaction. Returns the versions applied. */
export function migrateUp(raw: BetterSqlite3.Database, migrationsDir: string): string[] {
  const migrations = loadMigrations(migrationsDir);
  const done = new Set(appliedVersions(raw));
  const known = new Set(migrations.map((m) => m.version));
  for (const v of done)
    if (!known.has(v))
      throw new Error(`database has unknown migration ${v}; not in ${migrationsDir}`);
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.version)) continue;
    applyMigration(raw, m.up, () => {
      raw
        .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(m.version, m.name, nowIso());
    });
    applied.push(m.version);
  }
  return applied;
}

/** Revert the most recently applied migration. Returns its version, or null when nothing is applied. */
export function migrateDown(raw: BetterSqlite3.Database, migrationsDir: string): string | null {
  const last = appliedVersions(raw).at(-1);
  if (last === undefined) return null;
  const m = loadMigrations(migrationsDir).find((x) => x.version === last);
  if (!m) throw new Error(`applied migration ${last} not found in ${migrationsDir}`);
  applyMigration(raw, m.down, () => {
    raw.prepare('DELETE FROM schema_migrations WHERE version = ?').run(last);
  });
  return last;
}
