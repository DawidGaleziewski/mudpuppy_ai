import { describe, expect, it } from 'vitest';
import {
  isSensitiveKey,
  isSyntheticInput,
  looksLikeRawPayload,
  maskText,
  scrubJson,
} from '../src/pii.js';

/**
 * Boundary cases for the PII scrubber (spec 012 F-12): each table pins one edge of a pattern —
 * the value that must be masked and the near miss that must not — so a loosened or tightened
 * regex fails here. All values are made up.
 */

describe('maskText pattern edges', () => {
  it.each([
    // e-mail: every domain label is part of the address
    ['x user@mail.example.com y', 'x [email] y'],
    // JWT: three dot-separated segments of 5+ characters
    ['x eyJmYWtlLXRl.bm90LXJlYWw.dGVzdC1vbmx5 y', 'x [token] y'],
    // Bearer: any run of spaces, the prefix kept
    ['Authorization: Bearer abcdefghijklmnopqrst', 'Authorization: Bearer [token]'],
    ['Bearer  abcdefghijklmnop1', 'Bearer [token]'],
    // long tokens: a digit and a letter anywhere, from the first character on
    ['abcdef0123456789abcdef0123456789xy', '[token]'],
    ['0123456789abcdef0123456789abcdef', '[token]'],
    // international phones: no separator after the country code, a 3-digit code, text after
    ['+48601234567', '[phone]'],
    ['+420 601 234 567 890', '[phone]'],
    ['tel. +48 601 234 567 (mobile)', 'tel. [phone] (mobile)'],
    // cards: 13 and 19 digits, and a number whose doubled digits exceed 9 (Luhn's "minus 9")
    ['Card 4000000000006.', 'Card [card].'],
    ['Card 4000000000000000006.', 'Card [card].'],
    ['Card 4012888888881881', 'Card [card]'],
    // names: only the name is replaced, the greeting or label stays
    ['Cześć, Jan Kowalski!', 'Cześć, [name]!'],
    ['Imię i nazwisko: Anna Nowak', 'Imię i nazwisko: [name]'],
  ])('masks %j as %j', (input, masked) => {
    expect(maskText(input)).toBe(masked);
  });

  it.each([
    'eyJa.bcdef.ghijk', // first JWT segment too short
    'eyJabcde.x.fghij', // middle segment too short
    'eyJabcde.fghij.k', // last segment too short
    'Bearer short', // too short to be a credential
    '12345678901234567890123456789012', // digits only: no letter, not a token
    'Pneumonoultramicroscopicsilicovolcanoconiosis', // letters only: no digit, not a token
    'Card 4012888888881882', // card-shaped, fails Luhn
  ])('leaves the near miss %j alone', (input) => {
    expect(maskText(input)).toBe(input);
  });
});

describe('isSyntheticInput', () => {
  it('allows only a reserved test TLD at the very end of the address', () => {
    expect(isSyntheticInput('jan@shop.test.pl')).toBe(false);
    expect(isSyntheticInput('jan@shop.pl.test')).toBe(true);
  });
});

describe('isSensitiveKey', () => {
  it.each([
    'email',
    'e-mail',
    'EMAIL',
    'phone',
    'tel',
    'telephone',
    'mobile',
    'password',
    'passwd',
    'pass',
    'token',
    'access_token',
    'accesstoken',
    'refresh_token',
    'refreshtoken',
    'id_token',
    'idtoken',
    'secret',
    'api_key',
    'apikey',
    'authorization',
    'cookie',
    'session',
    'session_id',
    'sessionid',
    'first_name',
    'firstname',
    'last_name',
    'lastname',
    'full_name',
    'fullname',
    'name',
    'pesel',
    'iban',
    'card',
    'card_number',
    'cardnumber',
  ])('%s is sensitive', (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each(['username', 'nickname', 'emailVerified', 'passport', 'tokens', 'telephone_type', 'x'])(
    '%s is not (whole-key match only)',
    (key) => {
      expect(isSensitiveKey(key)).toBe(false);
    },
  );
});

describe('scrubJson edges', () => {
  it('passes null and numbers through', () => {
    expect(scrubJson(null)).toBeNull();
    expect(scrubJson(5)).toBe(5);
    expect(scrubJson({ a: null, n: 3 })).toEqual({ a: null, n: 3 });
  });

  it('keeps non-sensitive keys and recurses into objects under sensitive keys', () => {
    expect(scrubJson({ title: 'Hello' })).toEqual({ title: 'Hello' });
    expect(scrubJson({ name: { first: 'x' } })).toEqual({ name: { first: 'x' } });
  });

  it('keeps whole type tags under sensitive keys and redacts anything else', () => {
    for (const tag of ['string', 'array', 'array<string>', '[]', '{}'])
      expect(scrubJson({ name: tag })).toEqual({ name: tag });
    for (const value of ['notastring', 'string123'])
      expect(scrubJson({ password: value })).toEqual({ password: '[redacted]' });
  });
});

describe('looksLikeRawPayload edges', () => {
  it('is false for primitives, null and shape-only records', () => {
    expect(looksLikeRawPayload(42)).toBe(false);
    expect(looksLikeRawPayload(null)).toBe(false);
    expect(looksLikeRawPayload({ title: 'Hello' })).toBe(false);
    expect(looksLikeRawPayload({ name: { type: 'string' } })).toBe(false);
    expect(looksLikeRawPayload({ password: 'string' })).toBe(false);
    expect(looksLikeRawPayload({ password: null })).toBe(false);
  });

  it('is true when any one element or field carries a value', () => {
    expect(looksLikeRawPayload(['ok', 'jan@x.pl'])).toBe(true);
    expect(looksLikeRawPayload({ a: 'ok', b: 'jan@x.pl' })).toBe(true);
    expect(looksLikeRawPayload({ password: 'hunter-not-real' })).toBe(true);
  });
});
