import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEvidenceStore, type EvidenceStore } from '../src/evidence.js';
import { fitPayload, fitText } from '../src/trace/limits.js';

let dir: string;
let store: EvidenceStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pf-limits-'));
  store = createEvidenceStore(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v), 'utf8');

describe('fitPayload', () => {
  it('returns small values inline, scrubbed', async () => {
    const out = await fitPayload({ note: 'mail test.user@example.test' }, { store });
    expect(out).toEqual({ inline: { note: 'mail [email]' }, truncated: false });
  });

  it('turns undefined into null', async () => {
    expect(await fitPayload(undefined, { store })).toEqual({ inline: null, truncated: false });
  });

  it('offloads a large value to evidence and keeps a bounded preview inline', async () => {
    const big = {
      run_id: '01a0da20-3022-7000-9ef1-6ac7ce1a0035',
      actions: Array.from({ length: 400 }, (_, i) => ({
        id: i,
        accessible_name: `link ${i}`.repeat(10),
      })),
      title: 'x'.repeat(5000),
      contact: 'test.user@example.test',
    };
    const out = await fitPayload(big, { store, inlineBytes: 2048 });
    expect(out.truncated).toBe(true);
    expect(out.payload_ref).toMatch(/^[0-9a-f]{64}\.json$/);
    expect(bytes(out.inline)).toBeLessThanOrEqual(2048);

    const stored = readFileSync(store.resolve(out.payload_ref!), 'utf8');
    expect(stored).not.toContain('test.user@example.test');
    expect(JSON.parse(stored).actions).toHaveLength(400);
    expect(JSON.parse(stored).run_id).toBe('01a0da20-3022-7000-9ef1-6ac7ce1a0035');
    expect((out.inline as { run_id: string }).run_id).toBe('01a0da20-3022-7000-9ef1-6ac7ce1a0035');

    const preview = out.inline as { actions: unknown[]; title: string };
    expect(preview.actions.length).toBeLessThanOrEqual(6);
    expect(preview.title.length).toBeLessThanOrEqual(201);
  });

  it('falls back to top-level keys when even the preview is too large', async () => {
    const wide = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`key${i}`, i]));
    const out = await fitPayload(wide, { store, inlineBytes: 512 });
    expect(out.truncated).toBe(true);
    expect(bytes(out.inline)).toBeLessThanOrEqual(512);
    expect((out.inline as { _truncated: boolean })._truncated).toBe(true);
  });

  it('never throws on values JSON cannot serialise', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const out = await fitPayload(circular, { store });
    expect(out.truncated).toBe(true);
    expect(out.inline).toEqual({ _unserializable: true });
  });

  it('is deterministic for the same input', async () => {
    const v = { list: Array.from({ length: 50 }, (_, i) => i), s: 'y'.repeat(3000) };
    expect(await fitPayload(v, { store, inlineBytes: 256 })).toEqual(
      await fitPayload(v, { store, inlineBytes: 256 }),
    );
  });
});

describe('fitText', () => {
  it('masks and keeps short text', () => {
    expect(fitText('call +48 601 234 567 now')).toEqual({
      text: 'call [phone] now',
      truncated: false,
    });
  });

  it('cuts long text with an ellipsis within the limit', () => {
    const out = fitText('a'.repeat(5000), 300);
    expect(out.truncated).toBe(true);
    expect(out.text.length).toBe(300);
    expect(out.text.endsWith('…')).toBe(true);
  });

  it('does not split a surrogate pair', () => {
    const out = fitText(`${'a'.repeat(8)}😀tail`, 10);
    expect(out.text).toBe(`${'a'.repeat(8)}…`);
  });
});
