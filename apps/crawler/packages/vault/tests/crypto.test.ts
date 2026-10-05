import { chmodSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createRedactor,
  decrypt,
  djangoPbkdf2,
  encrypt,
  generatePassword,
  loadKey,
  SECRET_MASK,
  VaultError,
} from '../src/index.js';

const tmpKey = (): string => join(mkdtempSync(join(tmpdir(), 'vault-')), 'cfg', 'vault.key');
const aad = { portal_id: 'proving-ground-bank', environment: 'sandbox', ref: 'PG_BANK_PASSWORD' };
const VALUE = 'test-password-not-real';

describe('loadKey', () => {
  it('fails closed when the key is missing and names the path', () => {
    const path = tmpKey();
    expect(() => loadKey({ path })).toThrow(path);
  });

  it('creates an owner-only key file on first use and reloads the same key', () => {
    const path = tmpKey();
    const a = loadKey({ path, create: true });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(a.bytes).toHaveLength(32);
    expect(loadKey({ path }).id).toBe(a.id);
  });

  it('refuses a key file other users can read', () => {
    const path = tmpKey();
    loadKey({ path, create: true });
    writeFileSync(path, `${Buffer.alloc(32, 1).toString('base64')}\n`);
    chmodSync(path, 0o644);
    expect(() => loadKey({ path })).toThrow(/chmod 600/);
  });
});

describe('encrypt / decrypt', () => {
  const key = loadKey({ path: tmpKey(), create: true });

  it('round-trips and never leaves the plaintext in the ciphertext', () => {
    const sealed = encrypt(key, aad, VALUE);
    expect(sealed.ciphertext.includes(Buffer.from(VALUE))).toBe(false);
    expect(decrypt(key, aad, sealed)).toBe(VALUE);
  });

  it('uses a fresh nonce per value', () => {
    expect(encrypt(key, aad, VALUE).nonce.equals(encrypt(key, aad, VALUE).nonce)).toBe(false);
  });

  it.each([
    ['portal', { ...aad, portal_id: 'proving-ground-shop' }],
    ['environment', { ...aad, environment: 'staging' }],
    ['ref', { ...aad, ref: 'PG_BANK_LOGIN' }],
  ])('fails when the row is moved to another %s (AAD)', (_, other) => {
    expect(() => decrypt(key, other, encrypt(key, aad, VALUE))).toThrow(/decryption failed/);
  });

  it('fails on a tampered ciphertext', () => {
    const sealed = encrypt(key, aad, VALUE);
    sealed.ciphertext[0]! ^= 1;
    expect(() => decrypt(key, aad, sealed)).toThrow(VaultError);
  });

  it('names both key ids when the key was rotated', () => {
    const other = loadKey({ path: tmpKey(), create: true });
    const sealed = encrypt(other, aad, VALUE);
    expect(() => decrypt(key, aad, sealed)).toThrow(
      new RegExp(`stored with key ${other.id}, current key is ${key.id}; re-enter it`),
    );
  });
});

describe('redactor', () => {
  it('replaces raw, URL-encoded, form-encoded and JSON-escaped forms', () => {
    const r = createRedactor();
    r.add('pa ss"wo/rd');
    const text = [
      'pa ss"wo/rd',
      encodeURIComponent('pa ss"wo/rd'),
      'haslo=pa+ss%22wo%2Frd',
      JSON.stringify({ p: 'pa ss"wo/rd' }),
    ].join(' | ');
    expect(r.redact(text)).not.toMatch(/ss/);
    expect(r.redact(text).split(SECRET_MASK)).toHaveLength(5);
  });

  it('redacts keys and values in JSON, and ignores values that are too short', () => {
    const r = createRedactor();
    r.add('abc');
    r.add(VALUE);
    expect(r.size).toBe(1);
    expect(r.redactJson({ [VALUE]: [VALUE, 1, { x: `a ${VALUE} b` }], abc: 'abc' })).toEqual({
      [SECRET_MASK]: [SECRET_MASK, 1, { x: `a ${SECRET_MASK} b` }],
      abc: 'abc',
    });
  });

  it('replaces a longer secret whole when it contains a shorter one', () => {
    const r = createRedactor();
    r.add('jan.testowy');
    r.add('jan.testowy-backup');
    expect(r.redact('login jan.testowy-backup')).toBe(`login ${SECRET_MASK}`);
  });
});

describe('generatePassword / djangoPbkdf2', () => {
  it('generates distinct passwords of the requested length', () => {
    const a = generatePassword();
    expect(a).toHaveLength(24);
    expect(generatePassword()).not.toBe(a);
    expect(generatePassword(40)).toHaveLength(40);
  });

  it('matches the Django pbkdf2_sha256 format for a known vector', () => {
    // Django 5.2: PBKDF2PasswordHasher().encode('test-password-not-real', 'seedsalt', iterations=1000)
    const h = djangoPbkdf2(VALUE, { iterations: 1000, salt: 'seedsalt' });
    expect(h).toBe('pbkdf2_sha256$1000$seedsalt$pDX+tw176KSyc0dw0Zmwv41i744Cs31Wwjm9KI6/XJ8=');
    expect(h).not.toContain(VALUE);
  });
});
