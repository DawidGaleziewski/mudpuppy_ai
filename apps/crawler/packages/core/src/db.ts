import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Database } from './db-types.js';

export type PathfinderDb = Kysely<Database>;

export interface OpenedDb {
  /** Query builder for app code. */
  db: PathfinderDb;
  /** Raw connection, used by the migration runner and for synchronous transactions. */
  raw: BetterSqlite3.Database;
  close(): Promise<void>;
}

/** One SQLite file per environment/run context under `<dataDir>/db/`. */
export function dbPathFor(dataDir: string, environment: string): string {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(environment))
    throw new Error(`invalid environment name: ${environment}`);
  return join(dataDir, 'db', `${environment}.sqlite`);
}

/** PRAGMAs are set on the connection, never inside a migration (data/schema/README.md). */
export function applyPragmas(raw: BetterSqlite3.Database): void {
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
}

/** Open (creating the parent directory if needed) a file DB, or `:memory:` for tests. */
export function openDb(path: string): OpenedDb {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const raw = new BetterSqlite3(path);
  applyPragmas(raw);
  const db = new Kysely<Database>({ dialect: new SqliteDialect({ database: raw }) });
  return { db, raw, close: () => db.destroy() };
}
