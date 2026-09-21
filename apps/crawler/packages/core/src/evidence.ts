import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { maskText, scrubJson } from './pii.js';

/** `<64 hex sha256>.<ext>`, relative to the evidence root. */
const REF = /^[0-9a-f]{64}\.[a-z0-9]{1,8}$/;

export interface EvidenceStore {
  /** Absolute or cwd-relative directory, normally `data/evidence`. */
  readonly root: string;
  /** Mask PII, hash the masked bytes, write once, return the `evidence_ref`. */
  storeText(content: string, ext: string): Promise<string>;
  /** Deep-scrub a JSON value (network shape records), then store it as canonical JSON. */
  storeJson(value: unknown): Promise<string>;
  /** Absolute path for a ref; throws on anything that is not `<sha256>.<ext>` (no traversal). */
  resolve(ref: string): string;
}

export function isEvidenceRef(ref: string): boolean {
  return REF.test(ref);
}

/** JSON with sorted keys so identical content always hashes to the same ref. */
function canonicalJson(value: unknown): string {
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

  const write = async (masked: string, ext: string): Promise<string> => {
    if (!/^[a-z0-9]{1,8}$/.test(ext))
      throw new Error(`invalid evidence extension: ${JSON.stringify(ext)}`);
    const ref = `${createHash('sha256').update(masked, 'utf8').digest('hex')}.${ext}`;
    const path = resolve(ref);
    if (!existsSync(path)) {
      await mkdir(root, { recursive: true });
      const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, masked, 'utf8');
      await rename(tmp, path); // atomic; a concurrent identical write just replaces equal bytes
    }
    return ref;
  };

  return {
    root,
    resolve,
    storeText: (content, ext) => write(maskText(content), ext),
    storeJson: (value) => write(canonicalJson(scrubJson(value)), 'json'),
  };
}
