import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { migrateDown, migrateUp } from '../src/migrate.js';

const MIGRATIONS = resolve(__dirname, '../../../../../data/migrations');

it('0021 free environment names: format check, round-trip keeps rows, down refuses free names', () => {
  const o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  const ins = (e: string) =>
    o.raw
      .prepare(
        `INSERT INTO credentials (id,portal_id,environment,ref_name,ciphertext,nonce,key_id,created_at,updated_at)
         VALUES (lower(hex(randomblob(8))),'p',?,'X',x'00',zeroblob(12),'abcdef01','t','t')`,
      )
      .run(e);
  ins('sandbox');
  ins('dev-2');
  for (const bad of ['Dev', '1a', '', 'a_b', 'a'.repeat(41)])
    expect(() => ins(bad), bad).toThrow(/CHECK/);
  expect(() => ins('dev-2')).toThrow(/UNIQUE/);
  // down refuses while a free name exists, and rolls back
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
  expect(() => migrateDown(o.raw, MIGRATIONS)).toThrow(/CHECK/);
  o.raw.prepare(`DELETE FROM credentials WHERE environment = 'dev-2'`).run();
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0021');
  expect(() => ins('dev')).toThrow(/CHECK/);
  expect(migrateUp(o.raw, MIGRATIONS)).toEqual([
    '0021',
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
  ]);
  expect(o.raw.prepare('SELECT count(*) AS n FROM credentials').get()).toEqual({ n: 1 });
  expect(
    o.raw
      .prepare(`SELECT name FROM sqlite_master WHERE name = 'ix_process_live_process_env'`)
      .all(),
  ).toHaveLength(1);
  ins('acceptance');
});
