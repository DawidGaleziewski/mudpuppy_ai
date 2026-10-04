import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEvidenceStore, isEvidenceRef } from '../src/evidence.js';
import { scrubJson } from '../src/pii.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'evidence-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const aria = readFileSync(
  new URL('../../../tests/fixtures/aria/account-profile.yaml', import.meta.url),
  'utf8',
);

describe('evidence store', () => {
  it('stores identical content once', async () => {
    const store = createEvidenceStore(root);
    const a = await store.storeText('- main:\n    - heading "x"', 'yaml');
    const b = await store.storeText('- main:\n    - heading "x"', 'yaml');
    expect(a).toBe(b);
    expect(readdirSync(root)).toEqual([a]);
  });

  it('stores text as given (masking is the caller’s choice) and hashes the stored bytes', async () => {
    const store = createEvidenceStore(root);
    const ref = await store.storeText(aria, 'yaml');
    const onDisk = readFileSync(store.resolve(ref), 'utf8');
    expect(onDisk).toBe(aria);
    const { createHash } = await import('node:crypto');
    expect(ref).toBe(`${createHash('sha256').update(onDisk).digest('hex')}.yaml`);
  });

  it('stores bytes under the sha256 of the bytes, once', async () => {
    const store = createEvidenceStore(root);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255, 1, 2]);
    const a = await store.storeBinary(png, 'png');
    const b = await store.storeBinary(png, 'png');
    expect(a).toBe(b);
    const { createHash } = await import('node:crypto');
    expect(a).toBe(`${createHash('sha256').update(png).digest('hex')}.png`);
    expect(new Uint8Array(readFileSync(store.resolve(a)))).toEqual(png);
  });

  it('accepts the excalidraw extension', async () => {
    const store = createEvidenceStore(root);
    const ref = await store.storeText('{}', 'excalidraw');
    expect(isEvidenceRef(ref)).toBe(true);
    expect(ref.endsWith('.excalidraw')).toBe(true);
  });

  it('returns a ref that resolves to <root>/<sha256>.<ext>', async () => {
    const store = createEvidenceStore(root);
    const ref = await store.storeText('hello', 'txt');
    expect(isEvidenceRef(ref)).toBe(true);
    expect(store.resolve(ref)).toBe(join(root, ref));
    expect(readFileSync(store.resolve(ref), 'utf8')).toBe('hello');
  });

  it('stores JSON canonically (key order does not matter), scrubbing only when asked', async () => {
    const store = createEvidenceStore(root);
    const a = await store.storeJson({ b: 'string', a: 'number', email: 'jan@example.com' });
    const b = await store.storeJson({ email: 'jan@example.com', a: 'number', b: 'string' });
    expect(a).toBe(b);
    expect(a.endsWith('.json')).toBe(true);
    expect(readFileSync(store.resolve(a), 'utf8')).toBe(
      '{"a":"number","b":"string","email":"jan@example.com"}',
    );
    const scrubbed = await store.storeJson({ email: 'jan@example.com' }, scrubJson);
    expect(readFileSync(store.resolve(scrubbed), 'utf8')).toBe('{"email":"[redacted]"}');
  });

  it('rejects refs that could escape the root and bad extensions', async () => {
    const store = createEvidenceStore(root);
    expect(() => store.resolve('../etc/passwd')).toThrow();
    expect(() => store.resolve('abc.json')).toThrow();
    await expect(store.storeText('x', '../x')).rejects.toThrow();
  });
});
