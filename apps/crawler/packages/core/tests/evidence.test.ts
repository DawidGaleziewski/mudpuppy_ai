import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEvidenceStore, isEvidenceRef } from '../src/evidence.js';

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

  it('masks PII before the file is written and hashes the masked bytes', async () => {
    const store = createEvidenceStore(root);
    const ref = await store.storeText(aria, 'yaml');
    const onDisk = readFileSync(store.resolve(ref), 'utf8');
    expect(onDisk).not.toContain('anna.nowak');
    expect(onDisk).not.toContain('601 234 567');
    expect(onDisk).toContain('[email]');
    const { createHash } = await import('node:crypto');
    expect(ref).toBe(`${createHash('sha256').update(onDisk).digest('hex')}.yaml`);
  });

  it('returns a ref that resolves to <root>/<sha256>.<ext>', async () => {
    const store = createEvidenceStore(root);
    const ref = await store.storeText('hello', 'txt');
    expect(isEvidenceRef(ref)).toBe(true);
    expect(store.resolve(ref)).toBe(join(root, ref));
    expect(readFileSync(store.resolve(ref), 'utf8')).toBe('hello');
  });

  it('stores JSON canonically (key order does not matter) and scrubs it', async () => {
    const store = createEvidenceStore(root);
    const a = await store.storeJson({ b: 'string', a: 'number', email: 'jan@example.com' });
    const b = await store.storeJson({ email: 'jan@example.com', a: 'number', b: 'string' });
    expect(a).toBe(b);
    expect(a.endsWith('.json')).toBe(true);
    expect(readFileSync(store.resolve(a), 'utf8')).toBe(
      '{"a":"number","b":"string","email":"[redacted]"}',
    );
  });

  it('rejects refs that could escape the root and bad extensions', async () => {
    const store = createEvidenceStore(root);
    expect(() => store.resolve('../etc/passwd')).toThrow();
    expect(() => store.resolve('abc.json')).toThrow();
    await expect(store.storeText('x', '../x')).rejects.toThrow();
  });
});
