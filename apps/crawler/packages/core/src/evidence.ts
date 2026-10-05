import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SECRETS } from './secrets.js';

/** `<64 hex sha256>.<ext>`, relative to the evidence root (`excalidraw` is the longest extension). */
const REF = /^[0-9a-f]{64}\.[a-z0-9]{1,10}$/;
const EXT = /^[a-z0-9]{1,10}$/;

export interface EvidenceStore {
  /** Absolute or cwd-relative directory, normally `data/evidence`. */
  readonly root: string;
  /**
   * Hash the content, write once, return the `evidence_ref`. Stored as given: PII masking is the
   * caller's choice (per-portal `pii_scrub`, constitution 2.0.0), not the store's.
   */
  storeText(content: string, ext: string): Promise<string>;
  /**
   * Store a JSON value as canonical JSON. `scrub` transforms the value first (the trace passes its
   * own scrubber); without it the value is stored as given.
   */
  storeJson(value: unknown, scrub?: (value: unknown) => unknown): Promise<string>;
  /** Store bytes (screenshots, spec 008) under the sha256 of the bytes. */
  storeBinary(bytes: Uint8Array, ext: string): Promise<string>;
  /** Absolute path for a ref; throws on anything that is not `<sha256>.<ext>` (no traversal). */
  resolve(ref: string): string;
}

export function isEvidenceRef(ref: string): boolean {
  return REF.test(ref);
}

/** JSON with sorted keys so identical content always hashes to the same ref. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function createEvidenceStore(root: string): EvidenceStore {
  const resolve = (ref: string): string => {
    if (!isEvidenceRef(ref)) throw new Error(`invalid evidence_ref: ${JSON.stringify(ref)}`);
    return join(root, ref);
  };

  const write = async (bytes: Uint8Array, ext: string): Promise<string> => {
    if (!EXT.test(ext)) throw new Error(`invalid evidence extension: ${JSON.stringify(ext)}`);
    const ref = `${createHash('sha256').update(bytes).digest('hex')}.${ext}`;
    const path = resolve(ref);
    if (!existsSync(path)) {
      await mkdir(root, { recursive: true });
      const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, bytes);
      await rename(tmp, path); // atomic; a concurrent identical write just replaces equal bytes
    }
    return ref;
  };
  // Text evidence passes the secret redactor (spec 009 FR-019); binary (screenshots) cannot.
  const utf8 = (s: string): Uint8Array => Buffer.from(SECRETS.redact(s), 'utf8');

  return {
    root,
    resolve,
    storeText: (content, ext) => write(utf8(content), ext),
    storeJson: (value, scrub) => write(utf8(canonicalJson(scrub ? scrub(value) : value)), 'json'),
    storeBinary: (bytes, ext) => write(bytes, ext),
  };
}
