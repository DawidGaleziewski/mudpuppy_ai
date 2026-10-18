import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { migrateDown, migrateUp, openDb, type OpenedDb } from '../src/index.js';

const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));

let o: OpenedDb | undefined;
afterEach(async () => {
  await o?.close();
  o = undefined;
});

const ts = '2026-10-17T10:00:00.000Z';

it('0026 screens.merged_into: NULL by default, never into itself, down drops it and keeps rows', () => {
  o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  const run = (sql: string, ...p: unknown[]) => o!.raw.prepare(sql).run(...p);
  run(
    `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, started_at)
     VALUES ('r1','shop','anon','map','sandbox','v','1280x800','pl','chromium','{}',?)`,
    ts,
  );
  const screen = (id: string, cluster: string) =>
    run(
      `INSERT INTO screens (id, portal_id, route_template, cluster_id, title, first_seen_run, created_at)
       VALUES (?, 'shop', '/a', ?, 't', 'r1', ?)`,
      id,
      cluster,
      ts,
    );
  screen('s1', 'c1');
  screen('s2', 'c2');
  const merged = (id: string) =>
    (
      o!.raw.prepare('SELECT merged_into AS m FROM screens WHERE id = ?').get(id) as {
        m: string | null;
      }
    ).m;
  expect(merged('s1')).toBeNull();
  run(`UPDATE screens SET merged_into = 's1' WHERE id = 's2'`);
  expect(merged('s2')).toBe('s1');
  expect(() => run(`UPDATE screens SET merged_into = 's1' WHERE id = 's1'`)).toThrow(/CHECK/);
  expect(() => run(`UPDATE screens SET merged_into = 'nope' WHERE id = 's1'`)).toThrow(/FOREIGN/);
  run(`UPDATE screens SET merged_into = NULL WHERE id = 's2'`); // the merge is reversible
  expect(merged('s2')).toBeNull();

  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0028');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0027');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0026');
  const cols = (o.raw.prepare('PRAGMA table_info(screens)').all() as { name: string }[]).map(
    (c) => c.name,
  );
  expect(cols).not.toContain('merged_into');
  expect(o.raw.prepare('SELECT count(*) AS n FROM screens').get()).toEqual({ n: 2 });
  expect(migrateUp(o.raw, MIGRATIONS)).toEqual(['0026', '0027', '0028']);
  expect(merged('s1')).toBeNull();
  expect(o.raw.pragma('foreign_key_check')).toEqual([]);
});
