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

const cols = (table: string) =>
  (o!.raw.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

function seed() {
  const run = (sql: string, ...p: unknown[]) => o!.raw.prepare(sql).run(...p);
  run(
    `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, started_at)
     VALUES ('r1','shop','anon','map','sandbox','v','1280x800','pl','chromium','{}',?)`,
    ts,
  );
  run(
    `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence, stabilization, first_seen_run, created_at)
     VALUES ('st1','shop','fp1','c1','/a','t','${'a'.repeat(64)}.json','observed','settled','r1',?)`,
    ts,
  );
  return run;
}

it('0027 checkpoints: one per (run, state), start_url non-empty, steps_json an array, FKs hold', () => {
  o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  const run = seed();
  const ins = (id: string, url: string, steps: string, state = 'st1') =>
    run(
      `INSERT INTO checkpoints (id, run_id, state_id, start_url, steps_json, created_at, updated_at)
       VALUES (?, 'r1', ?, ?, ?, ?, ?)`,
      id,
      state,
      url,
      steps,
      ts,
      ts,
    );
  ins('c1', 'https://x.test/a', '[]');
  expect(() => ins('c2', 'https://x.test/a', '[]')).toThrow(/UNIQUE/);
  expect(() => ins('c3', '', '[]', 'st2')).toThrow(/CHECK|FOREIGN/);
  expect(() => ins('c4', 'https://x.test/a', '{}', 'st1')).toThrow(/CHECK|UNIQUE/);
  expect(() => ins('c5', 'https://x.test/a', 'not json')).toThrow(/CHECK|UNIQUE/);
  expect(() => ins('c6', 'https://x.test/a', '[]', 'nope')).toThrow(/FOREIGN/);
  const indexes = (
    o.raw
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'checkpoints'`)
      .all() as {
      name: string;
    }[]
  ).map((i) => i.name);
  expect(indexes).toContain('ix_checkpoints_state');
});

it('0027 runs and network_calls columns: NULL by default, CHECKs hold, down keeps every older column and row', () => {
  o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  const run = seed();
  const get = <T>(sql: string) => o!.raw.prepare(sql).get() as T;
  expect(get('SELECT run_type, parent_run_id, plan_json FROM runs')).toEqual({
    run_type: null,
    parent_run_id: null,
    plan_json: null,
  });
  expect(() => run(`UPDATE runs SET run_type = 'bogus' WHERE id = 'r1'`)).toThrow(/CHECK/);
  expect(() => run(`UPDATE runs SET plan_json = '{' WHERE id = 'r1'`)).toThrow(/CHECK/);
  expect(() => run(`UPDATE runs SET parent_run_id = 'nope' WHERE id = 'r1'`)).toThrow(/FOREIGN/);
  run(
    `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, started_at, run_type, parent_run_id, plan_json, owner_id, owner_pid)
     VALUES ('r2','shop','anon','map','sandbox','v','1280x800','pl','chromium','{}',?, 'continue','r1','{"depth":2}','srv',42)`,
    ts,
  );

  const call = (id: string, req: string | null) =>
    run(
      `INSERT INTO network_calls (id, run_id, method, url_template, status, req_schema, res_schema, created_at, req_sample, res_sample)
       VALUES (?, 'r1', 'GET', '/x', 200, '{}', '{}', ?, ?, NULL)`,
      id,
      ts,
      req,
    );
  call('n1', 'a'.repeat(4096));
  call('n2', null);
  expect(() => call('n3', 'a'.repeat(4097))).toThrow(/CHECK/);

  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0029');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0028');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0027');
  expect(cols('runs')).not.toEqual(expect.arrayContaining(['run_type']));
  expect(cols('runs')).toEqual(expect.arrayContaining(['owner_id', 'owner_pid', 'coverage']));
  expect(cols('network_calls')).not.toContain('req_sample');
  expect(cols('network_calls')).toContain('url');
  expect(o.raw.prepare('SELECT id, owner_id, owner_pid FROM runs ORDER BY id').all()).toEqual([
    { id: 'r1', owner_id: null, owner_pid: null },
    { id: 'r2', owner_id: 'srv', owner_pid: 42 },
  ]);
  expect(o.raw.prepare('SELECT count(*) AS n FROM states').get()).toEqual({ n: 1 });
  expect(o.raw.prepare('SELECT count(*) AS n FROM network_calls').get()).toEqual({ n: 2 });
  expect(o.raw.pragma('foreign_key_check')).toEqual([]);
  expect(() => run(`UPDATE runs SET owner_pid = 0 WHERE id = 'r1'`)).toThrow(/CHECK/);
  expect(migrateUp(o.raw, MIGRATIONS)).toEqual(['0027', '0028', '0029']);
  expect(get("SELECT run_type FROM runs WHERE id = 'r1'")).toEqual({ run_type: null });
});
