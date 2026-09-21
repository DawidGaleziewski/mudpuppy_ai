import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { looksLikeRawPayload, maskText, scrubJson } from '../src/pii.js';

const fixture = (n: string) =>
  readFileSync(new URL(`../../../tests/fixtures/aria/${n}`, import.meta.url), 'utf8');

describe('maskText', () => {
  it('masks names, emails, phones, tokens and card numbers in an ARIA snapshot', () => {
    const out = maskText(fixture('account-profile.yaml'));
    for (const leaked of [
      'Jan Kowalski',
      'Anna Nowak',
      'anna.nowak',
      '601 234 567',
      '512-345-678',
      'eyJhbGci',
      '3f2a9c1e7b6d',
      '4111 1111',
    ]) {
      expect(out).not.toContain(leaked);
    }
    expect(out).toContain('[name]');
    expect(out).toContain('[email]');
    expect(out).toContain('[phone]');
    expect(out).toContain('[token]');
    expect(out).toContain('[card]');
  });

  it('leaves prices, item ids in urls, and structural text untouched', () => {
    const out = maskText(fixture('account-profile.yaml'));
    expect(out).toContain('Cena: 1 299 zł');
    expect(out).toContain('/url: /oferty/123456789');
    expect(out).toContain('heading "Moje dane" [level=1]');
  });

  it('does not touch fixtures without PII', () => {
    for (const f of ['listing-laptops-a.yaml', 'search-results-macbook.yaml', 'form-login.yaml']) {
      expect(maskText(fixture(f))).toBe(fixture(f));
    }
  });

  it('is deterministic and idempotent', () => {
    const src = fixture('account-profile.yaml');
    expect(maskText(src)).toBe(maskText(src));
    expect(maskText(maskText(src))).toBe(maskText(src));
  });

  it('does not treat a card-shaped number that fails Luhn as a card', () => {
    expect(maskText('Nr 1234 5678 9012 3456')).not.toContain('[card]');
  });
});

describe('scrubJson / looksLikeRawPayload', () => {
  it('masks values and redacts sensitive keys', () => {
    expect(
      scrubJson({ email: 'a@b.pl', note: 'call +48 601 234 567', n: 3, items: [{ token: 'abc' }] }),
    ).toEqual({
      email: '[redacted]',
      note: 'call [phone]',
      n: 3,
      items: [{ token: '[redacted]' }],
    });
  });

  it('accepts shape-only records', () => {
    expect(
      looksLikeRawPayload({
        id: 'string',
        price: 'number',
        seller: { email: 'string' },
        tags: 'array<string>',
      }),
    ).toBe(false);
  });

  it('flags raw PII payloads', () => {
    expect(looksLikeRawPayload({ email: 'jan@example.com' })).toBe(true);
    expect(looksLikeRawPayload({ user: { phone: '601234567' } })).toBe(true);
    expect(looksLikeRawPayload({ note: 'Zadzwoń +48 601 234 567' })).toBe(true);
    expect(looksLikeRawPayload({ access_token: 'x' })).toBe(true);
  });
});
