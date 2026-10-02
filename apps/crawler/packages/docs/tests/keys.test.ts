import { afterEach, describe, expect, it } from 'vitest';
import { DocKind, KEY_PREFIX, newId, nowIso } from '@pathfinder/core';
import { formatKey, nextSeq, parseKey } from '../src/keys.js';
import { makeFixtureStore, type FixtureStore } from '../src/testing/index.js';

let fx: FixtureStore | undefined;
afterEach(async () => {
  await fx?.close();
  fx = undefined;
});

describe('formatKey / parseKey', () => {
  it('zero-pads the sequence to three digits', () => {
    expect(formatKey('requirement', 7)).toBe('REQ-007');
    expect(formatKey('glossary_term', 42)).toBe('GL-042');
    expect(formatKey('process', 999)).toBe('PROC-999');
  });

  it('grows wider when three digits are not enough', () => {
    expect(formatKey('requirement', 1000)).toBe('REQ-1000');
    expect(formatKey('data_item', 12345)).toBe('DI-12345');
  });

  it('refuses a sequence that is not a positive integer', () => {
    expect(() => formatKey('requirement', 0)).toThrow();
    expect(() => formatKey('requirement', 1.5)).toThrow();
    expect(() => formatKey('requirement', -1)).toThrow();
  });

  it('round-trips every kind', () => {
    for (const kind of DocKind.options) {
      expect(parseKey(formatKey(kind, 12))).toEqual({ kind, seq: 12 });
      expect(formatKey(kind, 12)).toBe(`${KEY_PREFIX[kind]}-012`);
    }
  });

  it('returns null for anything that is not a key', () => {
    for (const bad of [
      'REQ-7',
      'REQ007',
      'req-007',
      'XYZ-001',
      'REQ-000',
      'REQ-0001',
      ' REQ-001',
      '',
    ])
      expect(parseKey(bad)).toBeNull();
  });
});

describe('nextSeq', () => {
  const insert = (store: FixtureStore, portal: string, kind: DocKind, seq: number, withdrawn = 0) =>
    store.raw
      .prepare(
        `INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev, withdrawn,
         created_at, updated_at) VALUES (?, ?, ?, ?, ?, 't', 1, NULL, ?, ?, ?)`,
      )
      .run(newId(), portal, kind, formatKey(kind, seq), seq, withdrawn, nowIso(), nowIso());

  it('starts at 1 and counts per portal and kind', async () => {
    fx = await makeFixtureStore();
    expect(nextSeq(fx.raw, fx.portalId, 'requirement')).toBe(1);
    insert(fx, fx.portalId, 'requirement', 1);
    insert(fx, fx.portalId, 'requirement', 2);
    insert(fx, fx.otherPortalId, 'requirement', 9);
    expect(nextSeq(fx.raw, fx.portalId, 'requirement')).toBe(3);
    expect(nextSeq(fx.raw, fx.portalId, 'glossary_term')).toBe(1);
    expect(nextSeq(fx.raw, fx.otherPortalId, 'requirement')).toBe(10);
  });

  it('never reuses the key of a withdrawn record', async () => {
    fx = await makeFixtureStore();
    insert(fx, fx.portalId, 'business_rule', 1);
    insert(fx, fx.portalId, 'business_rule', 2, 1);
    expect(nextSeq(fx.raw, fx.portalId, 'business_rule')).toBe(3);
  });

  it('sees rows written earlier in the caller’s transaction', async () => {
    fx = await makeFixtureStore();
    const store = fx;
    const seqs = store.raw.transaction(() => {
      const a = nextSeq(store.raw, store.portalId, 'screen');
      insert(store, store.portalId, 'screen', a);
      const b = nextSeq(store.raw, store.portalId, 'screen');
      return [a, b];
    })();
    expect(seqs).toEqual([1, 2]);
  });
});
