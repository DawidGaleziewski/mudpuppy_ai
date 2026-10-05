import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateUp, openDb, type OpenedDb } from '@pathfinder/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  asEnvironment,
  createVaultStore,
  loadKey,
  personaRefs,
  resolvePersonaRefs,
  type VaultStore,
} from '../src/index.js';

const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));
const VALUE = 'test-password-not-real';
const P = 'proving-ground-bank';

let opened: OpenedDb;
let store: VaultStore;
beforeEach(() => {
  opened = openDb(':memory:');
  migrateUp(opened.raw, MIGRATIONS);
  const key = loadKey({ path: join(mkdtempSync(join(tmpdir(), 'vault-')), 'k'), create: true });
  store = createVaultStore(opened.db, key);
});
afterEach(() => opened.close());

describe('vault store', () => {
  it('stores encrypted, lists without values and never writes plaintext to the database', async () => {
    await store.set(P, 'sandbox', 'PG_BANK_PASSWORD', VALUE);
    expect(await store.get(P, 'sandbox', 'PG_BANK_PASSWORD')).toBe(VALUE);
    const listed = await store.list();
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(VALUE);
    const raw = opened.raw.prepare('SELECT * FROM credentials').all();
    expect(
      Buffer.from(
        JSON.stringify(raw, (_, v) => (Buffer.isBuffer(v) ? v.toString('latin1') : v)),
      ).includes(Buffer.from(VALUE)),
    ).toBe(false);
  });

  it('keeps environments apart and upserts on set', async () => {
    await store.set(P, 'sandbox', 'PG_BANK_PASSWORD', 'sandbox-value-not-real');
    await store.set(P, 'staging', 'PG_BANK_PASSWORD', 'staging-value-not-real');
    await store.set(P, 'sandbox', 'PG_BANK_PASSWORD', 'sandbox-value-2-not-real');
    expect(await store.get(P, 'sandbox', 'PG_BANK_PASSWORD')).toBe('sandbox-value-2-not-real');
    expect(await store.get(P, 'staging', 'PG_BANK_PASSWORD')).toBe('staging-value-not-real');
    expect(await store.list(P)).toHaveLength(2);
  });

  it('deletes, and reports missing rows', async () => {
    await store.set(P, 'sandbox', 'PG_BANK_LOGIN', 'jan.testowy');
    expect(await store.delete(P, 'sandbox', 'PG_BANK_LOGIN')).toBe(true);
    expect(await store.delete(P, 'sandbox', 'PG_BANK_LOGIN')).toBe(false);
    await expect(store.get(P, 'sandbox', 'PG_BANK_LOGIN')).rejects.toThrow(/no credential/);
  });

  it('rejects bad ref names and environments', async () => {
    await expect(store.set(P, 'sandbox', '1BAD', VALUE)).rejects.toThrow(/invalid ref name/);
    expect(() => asEnvironment('prod')).toThrow(/unknown environment/);
  });

  it('resolves persona refs by auth field and names the missing ones', async () => {
    await store.set(P, 'sandbox', 'PG_BANK_LOGIN', 'jan.testowy');
    const auth = { login: 'ref:PG_BANK_LOGIN', password: 'ref:PG_BANK_PASSWORD' };
    expect(personaRefs(auth)).toEqual({ login: 'PG_BANK_LOGIN', password: 'PG_BANK_PASSWORD' });
    expect(await resolvePersonaRefs(store, P, 'sandbox', auth)).toEqual({
      values: { login: 'jan.testowy' },
      missing: ['PG_BANK_PASSWORD'],
    });
    expect(await resolvePersonaRefs(store, P, 'sandbox', 'none')).toEqual({
      values: {},
      missing: [],
    });
  });
});
