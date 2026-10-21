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

  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0044');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0043');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0042');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0041');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0040');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0039');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0038');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0037');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0036');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0035');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0034');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0033');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0032');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0031');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0030');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0029');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0028');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0027');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0026');
  const cols = (o.raw.prepare('PRAGMA table_info(screens)').all() as { name: string }[]).map(
    (c) => c.name,
  );
  expect(cols).not.toContain('merged_into');
  expect(o.raw.prepare('SELECT count(*) AS n FROM screens').get()).toEqual({ n: 2 });
  expect(migrateUp(o.raw, MIGRATIONS)).toEqual([
    '0026',
    '0027',
    '0028',
    '0029',
    '0030',
    '0031',
    '0032',
    '0033',
    '0034',
    '0035',
    '0036',
    '0037',
    '0038',
    '0039',
    '0040',
    '0041',
    '0042',
    '0043',
    '0044',
  ]);
  expect(merged('s1')).toBeNull();
  expect(o.raw.pragma('foreign_key_check')).toEqual([]);
});
