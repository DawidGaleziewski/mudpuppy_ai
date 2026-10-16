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
  expect(() => migrateDown(o.raw, MIGRATIONS)).toThrow(/CHECK/);
  o.raw.prepare(`DELETE FROM credentials WHERE environment = 'dev-2'`).run();
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0021');
  expect(() => ins('dev')).toThrow(/CHECK/);
  expect(migrateUp(o.raw, MIGRATIONS)).toEqual(['0021']);
  expect(o.raw.prepare('SELECT count(*) AS n FROM credentials').get()).toEqual({ n: 1 });
  expect(
    o.raw
      .prepare(`SELECT name FROM sqlite_master WHERE name = 'ix_process_live_process_env'`)
      .all(),
  ).toHaveLength(1);
  ins('acceptance');
});
