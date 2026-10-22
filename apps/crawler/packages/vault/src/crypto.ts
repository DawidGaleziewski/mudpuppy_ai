import {
  createCipheriv,
  createDecipheriv,
  createHash,
  pbkdf2Sync,
  randomBytes,
  randomInt,
} from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { VaultError } from './errors.js';

/** A loaded vault key: 32 random bytes and the id stored next to every value it sealed. */
export interface VaultKey {
  id: string;
  bytes: Buffer;
}

/** Binds a ciphertext to its row: a value copied to another portal, environment or name fails. */
export interface SealAad {
  portal_id: string;
  environment: string;
  ref: string;
}

export interface Sealed {
  nonce: Buffer;
  /** AES-256-GCM ciphertext followed by the 16-byte tag. */
  ciphertext: Buffer;
  key_id: string;
}

const TAG_BYTES = 16;

/** `MUDPUPPY_VAULT_KEY_FILE`, else `~/.config/mudpuppy/vault.key` (research §5). */
export function defaultKeyPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.MUDPUPPY_VAULT_KEY_FILE ?? join(homedir(), '.config', 'mudpuppy', 'vault.key');
}

export const keyId = (bytes: Buffer): string =>
  createHash('sha256').update(bytes).digest('hex').slice(0, 8);

/**
 * Read the key file (base64 of 32 bytes). With `create`, a missing file is created with owner-only
 * permissions (directory 0700, file 0600). Without it, a missing key fails closed.
 */
export function loadKey(opts: { path?: string; create?: boolean } = {}): VaultKey {
  const path = opts.path ?? defaultKeyPath();
  if (!existsSync(path)) {
    if (!opts.create)
      throw new VaultError(
        'KEY_MISSING',
        `vault key not found at ${path}; set MUDPUPPY_VAULT_KEY_FILE or run "pnpm vault set" to create it`,
      );
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, `${randomBytes(32).toString('base64')}\n`, { mode: 0o600, flag: 'wx' });
    chmodSync(path, 0o600);
  }
  if (process.platform !== 'win32' && (statSync(path).mode & 0o077) !== 0)
    throw new VaultError(
      'KEY_PERMISSIONS',
      `vault key ${path} is readable by other users; run "chmod 600 ${path}"`,
    );
  const bytes = Buffer.from(readFileSync(path, 'utf8').trim(), 'base64');
  if (bytes.length !== 32)
    throw new VaultError('KEY_INVALID', `vault key ${path} is not 32 base64-encoded bytes`);
  return { id: keyId(bytes), bytes };
}

const aadBytes = (aad: SealAad): Buffer =>
  Buffer.from(`${aad.portal_id}|${aad.environment}|${aad.ref}`, 'utf8');

export function encrypt(key: VaultKey, aad: SealAad, plaintext: string): Sealed {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key.bytes, nonce);
  cipher.setAAD(aadBytes(aad));
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { nonce, ciphertext: Buffer.concat([body, cipher.getAuthTag()]), key_id: key.id };
}

export function decrypt(key: VaultKey, aad: SealAad, sealed: Sealed): string {
  if (sealed.key_id !== key.id)
    throw new VaultError(
      'KEY_MISMATCH',
      `${aad.ref} for ${aad.portal_id} on ${aad.environment} was stored with key ${sealed.key_id}, current key is ${key.id}; re-enter it`,
    );
  const ct = Buffer.from(sealed.ciphertext);
  if (ct.length < TAG_BYTES) throw tampered(aad);
  const decipher = createDecipheriv('aes-256-gcm', key.bytes, Buffer.from(sealed.nonce));
  decipher.setAAD(aadBytes(aad));
  decipher.setAuthTag(ct.subarray(ct.length - TAG_BYTES));
  try {
    return Buffer.concat([
      decipher.update(ct.subarray(0, ct.length - TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw tampered(aad);
  }
}

const tampered = (aad: SealAad): VaultError =>
  new VaultError(
    'DECRYPT_FAILED',
    `decryption failed for ${aad.ref} (tampered or wrong portal/env)`,
  );

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_.!';

/** A random password from an unambiguous alphabet (uniform: `randomInt` has no modulo bias). */
export function generatePassword(length = 24): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/**
 * Django's `pbkdf2_sha256$<iterations>$<salt>$<base64 hash>` format, so the proving ground's seed
 * file holds hashes, never plaintext (research §5). Django checks it with `check_password`.
 */
export function djangoPbkdf2(
  password: string,
  opts: { iterations?: number; salt?: string } = {},
): string {
  const iterations = opts.iterations ?? 600_000;
  const salt =
    opts.salt ?? randomBytes(16).toString('base64url').replace(/[-_]/g, 'x').slice(0, 22);
  if (salt.includes('$')) throw new VaultError('INVALID_INPUT', 'salt must not contain "$"');
  const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64');
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}
