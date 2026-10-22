import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createEvidenceStore,
  createLogger,
  newId,
  nowIso,
  SECRET_MASK,
  SECRETS,
} from '@mudpuppy/core';
import { migrateUp } from '../src/migrate.js';
import { openDb, type OpenedDb } from '../src/db.js';

const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));
// Vitest isolates module state per file, so this registration stays local to this file.
const SECRET = 'test-password-not-real';
SECRETS.add(SECRET);

let opened: OpenedDb | undefined;
afterEach(async () => {
  await opened?.close();
  opened = undefined;
});

describe('secret choke points (spec 009 FR-019)', () => {
  it('the Kysely plugin redacts INSERT and UPDATE values but not reads', async () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const blob = Buffer.from(SECRET);
    await opened.db
      .insertInto('credentials')
      .values({
        id: newId(),
        portal_id: `p ${SECRET}`,
        environment: 'sandbox',
        ref_name: 'R',
        ciphertext: blob,
        nonce: Buffer.alloc(12),
        key_id: 'abcdef12',
        created_at: nowIso(),
        updated_at: nowIso(),
      })
      .execute();
    await opened.db
      .updateTable('credentials')
      .set({ updated_at: `x ${SECRET}` })
      .execute();
    const row = opened.raw
      .prepare('SELECT portal_id, updated_at, ciphertext FROM credentials')
      .get() as { portal_id: string; updated_at: string; ciphertext: Buffer };
    expect(row.portal_id).toBe(`p ${SECRET_MASK}`);
    expect(row.updated_at).toBe(`x ${SECRET_MASK}`);
    // binary values pass untouched (the vault's ciphertexts are Buffers)
    expect(Buffer.from(row.ciphertext).equals(blob)).toBe(true);
    // a WHERE with the secret is not rewritten (it simply finds nothing)
    const found = await opened.db
      .selectFrom('credentials')
      .select('id')
      .where('portal_id', '=', SECRET)
      .execute();
    expect(found).toEqual([]);
  });

  it('text and JSON evidence is redacted before it is hashed and written', async () => {
    const ev = createEvidenceStore(mkdtempSync(join(tmpdir(), 'ev-')));
    const t = await ev.storeText(`login ok, haslo=${encodeURIComponent(SECRET)}`, 'txt');
    const j = await ev.storeJson({ body: { password: SECRET } });
    for (const ref of [t, j]) expect(readFileSync(ev.resolve(ref), 'utf8')).not.toContain(SECRET);
    expect(readFileSync(ev.resolve(j), 'utf8')).toContain(SECRET_MASK);
  });

  it('log lines are redacted in messages and objects', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const log = createLogger({ destination: sink });
    log.info({ form: { haslo: SECRET } }, `filled ${SECRET}`);
    expect(lines.join('')).not.toContain(SECRET);
    expect(lines.join('')).toContain(SECRET_MASK);
  });
});
