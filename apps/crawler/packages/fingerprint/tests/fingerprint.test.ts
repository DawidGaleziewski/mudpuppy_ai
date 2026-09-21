import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalizeAria } from '../src/aria-canonical.js';
import { computeFingerprint, FingerprintIndex, similarity } from '../src/fingerprint.js';

const aria = (name: string): string =>
  readFileSync(new URL(`../../../tests/fixtures/aria/${name}.yaml`, import.meta.url), 'utf8');

const LISTING = '/oferty/komputery/laptopy';
const fp = (name: string, routeTemplate = LISTING, snapshot = aria(name)) =>
  computeFingerprint({ routeTemplate, ariaSnapshot: snapshot });

describe('canonicalizeAria', () => {
  it('drops ref ids and url props, and reports open overlays', () => {
    const c = canonicalizeAria(
      '- dialog "Cookies" [ref=e3]:\n  - button "OK" [ref=e4] [cursor=pointer]\n  - link "x":\n    - /url: /a',
    );
    expect(c.text).not.toMatch(/ref=|\/url/);
    expect(c.overlays).toEqual(['dialog:Cookies']);
  });

  it('masks prices, counters and timestamps', () => {
    const c = canonicalizeAria(
      [
        '- text: 1 299,00 zł',
        '- text: $12.50',
        '- text: Znaleziono 1 234 oferty',
        '- text: Dodano 5 minut temu',
        '- text: Zaktualizowano 2026-09-21 10:30',
        '- text: Koniec o 23:59:01',
      ].join('\n'),
    );
    expect(c.text).toContain('<price>');
    expect(c.text).not.toMatch(/1 299|12\.50|1 234|5 minut|2026|23:59/);
  });
});

describe('level 1 fingerprint', () => {
  it('is stable across reruns', () => {
    expect(fp('listing-laptops-a').level1).toBe(fp('listing-laptops-a').level1);
    expect(fp('listing-laptops-a').level1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('masks volatile content (prices, counters, timestamps)', () => {
    const changed = aria('listing-laptops-a')
      .replace('1 299,00 zł', '1 249,00 zł')
      .replace('Znaleziono 1 234 oferty', 'Znaleziono 1 301 oferty')
      .replace('Dodano 5 minut temu', 'Dodano 9 minut temu');
    expect(changed).not.toBe(aria('listing-laptops-a'));
    expect(fp('listing-laptops-a', LISTING, changed).level1).toBe(fp('listing-laptops-a').level1);
  });

  it('differs for different content, structure, route template or open overlays', () => {
    const a = fp('listing-laptops-a');
    expect(fp('listing-laptops-b').level1).not.toBe(a.level1);
    expect(fp('form-login').level1).not.toBe(a.level1);
    expect(fp('listing-laptops-a', '/other').level1).not.toBe(a.level1);
    const overlay = fp('listing-with-overlay');
    expect(overlay.overlays).toEqual(['dialog:Ustawienia prywatności']);
    expect(overlay.level1).not.toBe(a.level1);
  });
});

describe('level 2 clustering', () => {
  it('puts listings with different items in one cluster and the form page in another', () => {
    const index = new FingerprintIndex();
    const a = index.assign(fp('listing-laptops-a'));
    const b = index.assign(fp('listing-laptops-b'));
    const form = index.assign(fp('form-login', '/konto/zaloguj'));

    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(b.clusterId).toBe(a.clusterId);
    expect(form.clusterId).not.toBe(a.clusterId);
  });

  it('keeps the search results page apart from the login form', () => {
    const index = new FingerprintIndex();
    const form = index.assign(fp('form-login', '/konto/zaloguj'));
    const search = index.assign(fp('search-results-macbook', '/szukaj'));
    expect(search.clusterId).not.toBe(form.clusterId);
  });

  it('returns loggable merge/split decision records', () => {
    const index = new FingerprintIndex();
    const first = index.assign(fp('listing-laptops-a'));
    const merged = index.assign(fp('listing-laptops-b'));
    const split = index.assign(fp('form-login', '/konto/zaloguj'));
    const again = index.assign(fp('listing-laptops-a'));

    expect(first.decision).toMatchObject({
      kind: 'split',
      reason: 'new-cluster',
      matchedFingerprint: null,
    });
    expect(merged.decision).toMatchObject({
      kind: 'merge',
      reason: 'similar-structure',
      matchedFingerprint: first.fingerprint,
      threshold: 0.9,
    });
    expect(merged.decision.similarity).toBeGreaterThanOrEqual(0.9);
    expect(split.decision.kind).toBe('split');
    expect(split.decision.similarity).toBeLessThan(0.9);
    expect(again.decision).toMatchObject({
      kind: 'merge',
      reason: 'identical-fingerprint',
      similarity: 1,
    });
    expect(again.clusterId).toBe(first.clusterId);
    for (const d of [first, merged, split, again]) {
      expect(JSON.parse(JSON.stringify(d.decision))).toEqual(d.decision);
    }
  });

  it('honours a configurable threshold', () => {
    const a = fp('listing-laptops-a');
    const b = fp('listing-laptops-b');
    const sim = similarity(a.level2, b.level2);
    expect(sim).toBeGreaterThanOrEqual(0.9);

    const strict = new FingerprintIndex({ threshold: Math.min(1, sim + 0.01) });
    if (sim < 1) {
      strict.assign(a);
      expect(strict.assign(b).decision.kind).toBe('split');
    }
    const loose = new FingerprintIndex({ threshold: 0.1 });
    loose.assign(fp('listing-laptops-a'));
    expect(loose.assign(fp('form-login', '/konto/zaloguj')).decision.kind).toBe('merge');
  });

  it('is deterministic across index instances', () => {
    const run = () => {
      const i = new FingerprintIndex();
      return ['listing-laptops-a', 'listing-laptops-b', 'form-login'].map(
        (n) => i.assign(fp(n)).clusterId,
      );
    };
    expect(run()).toEqual(run());
  });
});
