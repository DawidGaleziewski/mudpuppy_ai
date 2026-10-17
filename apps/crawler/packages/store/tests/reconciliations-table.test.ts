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

it('0025 reconciliations: CHECKs hold, one open proposal per group, down drops the table', () => {
  o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  const run = (sql: string, ...p: unknown[]) => o!.raw.prepare(sql).run(...p);
  const insert = (id: string, over: Record<string, string | null> = {}) => {
    const v = {
      group_key: 'g1',
      group_kind: 'action',
      snapshot: '{}',
      proposal: '[]',
      status: 'proposed',
      confirmed: null,
      by: null,
      at: null,
      ...over,
    };
    run(
      `INSERT INTO reconciliations (id, portal_id, group_key, group_kind, snapshot_json, proposal_json,
         proposed_by, proposed_at, status, confirmed_json, confirmed_by, confirmed_at)
       VALUES (?, 'shop', ?, ?, ?, ?, 'BA', ?, ?, ?, ?, ?)`,
      id,
      v.group_key,
      v.group_kind,
      v.snapshot,
      v.proposal,
      ts,
      v.status,
      v.confirmed,
      v.by,
      v.at,
    );
  };
  insert('a');
  expect(() => insert('b')).toThrow(/UNIQUE/); // second open proposal for the same group
  insert('c', { group_key: 'g2' });
  expect(() => insert('d', { group_kind: 'other', group_key: 'g3' })).toThrow(/CHECK/);
  expect(() => insert('e', { status: 'open', group_key: 'g3' })).toThrow(/CHECK/);
  expect(() => insert('f', { snapshot: '[]', group_key: 'g3' })).toThrow(/CHECK/);
  expect(() => insert('g', { proposal: '{}', group_key: 'g3' })).toThrow(/CHECK/);
  // confirmed_json, confirmed_by, confirmed_at are all set iff status = 'confirmed'
  expect(() => insert('h', { status: 'confirmed', group_key: 'g3' })).toThrow(/CHECK/);
  expect(() => insert('i', { confirmed: '[]', by: 'Ola', at: ts, group_key: 'g3' })).toThrow(
    /CHECK/,
  );
  expect(() =>
    insert('j', { status: 'confirmed', confirmed: '[]', by: 'Ola', group_key: 'g3' }),
  ).toThrow(/CHECK/);
  insert('k', { status: 'confirmed', confirmed: '[]', by: 'Ola', at: ts });
  insert('l', { status: 'superseded' });
  expect(migrateDown(o.raw, MIGRATIONS)).toBe('0025');
  expect(
    o.raw.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%reconciliations%'").all(),
  ).toEqual([]);
  expect(migrateUp(o.raw, MIGRATIONS)).toEqual(['0025']);
  expect(o.raw.pragma('foreign_key_check')).toEqual([]);
});
