import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { migrateDown, migrateUp, openDb, type OpenedDb } from '../src/index.js';

const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));

let o: OpenedDb | undefined;
afterEach(async () => {
  await o?.close();
  o = undefined;
});

const ts = '2026-10-16T10:00:00.000Z';

function seed(db: OpenedDb): void {
  db.raw
    .prepare(
      `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, started_at)
       VALUES ('r1','shop','anon','map','sandbox','v','1280x800','pl','chromium','{}',?)`,
    )
    .run(ts);
  db.raw
    .prepare(
      `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence, stabilization, first_seen_run, created_at)
       VALUES ('s1','shop','f1','c','/quote','Quote','a.json','observed','settled','r1',?)`,
    )
    .run(ts);
}

it('0022/0023 round-trip (up, down, up), CHECKs hold, and down restores the states shape', () => {
  o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  seed(o);
  const run = (sql: string, ...p: unknown[]) => o!.raw.prepare(sql).run(...p);
  const step = `INSERT INTO form_steps (id, portal_id, route_template, step_index, controls_json, label, first_seen_run, created_at)
                VALUES (?, 'shop', '/quote', ?, '[]', 'step 1', 'r1', ?)`;
  run(step, 'fs1', 1, ts);
  expect(() => run(step, 'fs2', 1, ts)).toThrow(/UNIQUE/);
  expect(() => run(step, 'fs3', 0, ts)).toThrow(/CHECK/);
  run(`UPDATE states SET form_step_id = 'fs1', state_kind = 'validation' WHERE id = 's1'`);
  expect(() => run(`UPDATE states SET state_kind = 'other' WHERE id = 's1'`)).toThrow(/CHECK/);

  const outcome = (over: Record<string, string>) => {
    const v = {
      outcome_kind: "'next'",
      probe_group: "'validation'",
      evidence_ref: "'a.json'",
      fault: 'NULL',
      ...over,
    };
    run(
      `INSERT INTO probe_outcomes (id, run_id, from_state_id, probe_id, probe_group, inputs_json, path_json, fault, outcome_kind, messages_json, evidence_ref, created_at)
       VALUES (lower(hex(randomblob(8))), 'r1', 's1', 'required-empty-one', ${v.probe_group}, '[]', '{}', ${v.fault}, ${v.outcome_kind}, '[]', ${v.evidence_ref}, '${ts}')`,
    );
  };
  outcome({});
  expect(() => outcome({ evidence_ref: "''" })).toThrow(/CHECK/);
  expect(() => outcome({ outcome_kind: "'weird'" })).toThrow(/CHECK/);
  expect(() => outcome({ probe_group: "'weird'" })).toThrow(/CHECK/);
  expect(() => outcome({ fault: "'weird'" })).toThrow(/CHECK/);
  outcome({ fault: "'http_500'", outcome_kind: "'technical'", probe_group: "'technical'" });

  const suite = (status: string, extra = '') =>
    run(
      `INSERT INTO probe_suites (id, portal_id, run_id, trace_json, notes_json, status, created_at ${extra ? ', approved_json, decided_at' : ''})
       VALUES (lower(hex(randomblob(8))), 'shop', 'r1', '{}', '[]', '${status}', '${ts}' ${extra})`,
    );
  suite('open');
  expect(() => suite('approved')).toThrow(/CHECK/);
  expect(() => suite('dismissed')).toThrow(/CHECK/);
  suite('approved', `, '{}', '${ts}'`);

  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0048');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0047');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0046');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0045');
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
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0025');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0024');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0023');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0022');
  const cols = (o.raw.prepare('PRAGMA table_info(states)').all() as { name: string }[]).map(
    (c) => c.name,
  );
  expect(cols).not.toContain('state_kind');
  expect(cols).toContain('screen_rev');
  expect(o.raw.prepare('SELECT count(*) AS n FROM states').get()).toEqual({ n: 1 });
  expect(o.raw.prepare("SELECT name FROM sqlite_master WHERE name = 'form_steps'").all()).toEqual(
    [],
  );
  expect(migrateUp(o.raw, MIGRATIONS)).toEqual([
    '0022',
    '0023',
    '0024',
    '0025',
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
    '0045',
    '0046',
    '0047',
    '0048',
  ]);
  expect(o.raw.prepare('SELECT state_kind FROM states').get()).toEqual({ state_kind: 'main' });
  expect(o.raw.pragma('foreign_key_check')).toEqual([]);
});

it('0024 marks: CHECKs hold, one open mark per target and kind, down drops the table', () => {
  o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  seed(o);
  const run = (sql: string, ...p: unknown[]) => o!.raw.prepare(sql).run(...p);
  const step = `INSERT INTO form_steps (id, portal_id, route_template, step_index, controls_json, label, first_seen_run, created_at)
                VALUES (?, 'shop', '/quote', ?, '[]', 'step', 'r1', ?)`;
  run(step, 'fs1', 1, ts);
  run(step, 'fs2', 2, ts);
  // 0041: a mark names its target in a typed column (form step, state or transition).
  const mark = (id: string, over: Record<string, string | null> = {}) => {
    const v = { kind: 'probe', form_step_id: 'fs1', state_id: null, by: 'Ola', ...over };
    run(
      `INSERT INTO marks (id, portal_id, kind, form_step_id, state_id, created_by, created_at)
       VALUES (?, 'shop', ?, ?, ?, ?, ?)`,
      id,
      v.kind,
      v.form_step_id,
      v.state_id,
      v.by,
      ts,
    );
  };
  mark('m1');
  expect(() => mark('m2')).toThrow(/UNIQUE/);
  mark('m3', { kind: 'skip' });
  mark('m4', { form_step_id: 'fs2' });
  expect(() => mark('m5', { kind: 'other' })).toThrow(/CHECK/);
  expect(() => mark('m6', { form_step_id: null })).toThrow(/CHECK/); // no target
  expect(() => mark('m6', { state_id: 's1' })).toThrow(/CHECK/); // two targets
  expect(() => mark('m7', { form_step_id: 'gone' })).toThrow(/FOREIGN KEY/);
  expect(() => mark('m8', { by: '' })).toThrow(/CHECK/);
  expect(() => run(`UPDATE marks SET used_by_run_id = 'r1' WHERE id = 'm1'`)).toThrow(/CHECK/);
  run(`UPDATE marks SET used_by_run_id = 'r1', used_at = ? WHERE id = 'm1'`, ts);
  mark('m9'); // the used mark no longer blocks a new open one
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0048');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0047');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0046');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0045');
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
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0025');
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0024');
  expect(o.raw.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%marks%'").all()).toEqual(
    [],
  );
  migrateUp(o.raw, MIGRATIONS);
  expect(o.raw.pragma('foreign_key_check')).toEqual([]);
});
