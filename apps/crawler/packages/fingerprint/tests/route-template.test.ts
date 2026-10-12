import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inferRouteTemplates, normalizeUrl } from '../src/route-template.js';

interface UrlFixture {
  normalization: { input: string; expected: string }[];
  urls: string[];
  templates: { url: string; expected: string }[];
}

const fixture = JSON.parse(
  readFileSync(
    new URL('../../../tests/fixtures/urls/marketsite-urls.json', import.meta.url),
    'utf8',
  ),
) as UrlFixture;

describe('normalizeUrl (RFC 3986)', () => {
  it.each(fixture.normalization)('normalizes $input', ({ input, expected }) => {
    expect(normalizeUrl(input)).toBe(expected);
  });

  it('strips tracking params but keeps functional ones', () => {
    const url = normalizeUrl('https://example.com/a?utm_source=x&id=7&gclid=1&fbclid=2&utm_term=y');
    expect(url).toBe('https://example.com/a?id=7');
  });

  it('sorts query params so order does not matter', () => {
    expect(normalizeUrl('https://example.com/a?b=2&a=1')).toBe(
      normalizeUrl('https://example.com/a?a=1&b=2'),
    );
  });

  it('drops plain fragments but keeps hash-routed ones', () => {
    expect(normalizeUrl('https://example.com/a#section')).toBe('https://example.com/a');
    expect(normalizeUrl('https://example.com/#/inbox')).toBe('https://example.com/#/inbox');
  });

  it('accepts custom tracking params', () => {
    expect(normalizeUrl('https://example.com/a?aff=9&id=1', { trackingParams: ['aff'] })).toBe(
      'https://example.com/a?id=1',
    );
  });
});

describe('inferRouteTemplates', () => {
  const templater = inferRouteTemplates(fixture.urls);

  it.each(fixture.templates)('maps $url to $expected', ({ url, expected }) => {
    expect(templater.templateFor(url)).toBe(expected);
  });

  it('collapses numeric, UUID and long-hash segments to :param even for a single URL', () => {
    const t = inferRouteTemplates([]);
    expect(t.templateFor('https://example.com/orders/12345')).toBe('/orders/:param');
    expect(t.templateFor('https://example.com/orders/0b9f2c1e-7d4a-4c1b-9a3e-5f6d7c8b9a01')).toBe(
      '/orders/:param',
    );
    expect(t.templateFor('https://example.com/files/9f86d081884c7d659a2feaa0c55ad015')).toBe(
      '/files/:param',
    );
    expect(t.templateFor('https://example.com/oferta/laptop-6501234')).toBe('/oferta/:param');
  });

  it('keeps low-cardinality segments literal', () => {
    expect(templater.templateFor('https://marketsite.example/oferty/telefony')).toBe(
      '/oferty/telefony',
    );
    expect(templater.templateFor('https://marketsite.example/konto/zaloguj')).toBe(
      '/konto/zaloguj',
    );
  });

  it('collapses a high-cardinality position once the threshold is exceeded', () => {
    const urls = Array.from(
      { length: 4 },
      (_, i) => `https://example.com/tag/name-${String.fromCharCode(97 + i)}`,
    );
    expect(inferRouteTemplates(urls, { highCardinality: 5 }).templateFor(urls[0]!)).toBe(
      '/tag/name-a',
    );
    expect(inferRouteTemplates(urls, { highCardinality: 3 }).templateFor(urls[0]!)).toBe(
      '/tag/:param',
    );
  });

  it('applies the threshold per position, merging subtrees under :param', () => {
    const urls = ['a', 'b', 'c', 'd'].flatMap((n) => [
      `https://example.com/u/${n}`,
      `https://example.com/u/${n}/edit`,
    ]);
    const t = inferRouteTemplates(urls, { highCardinality: 3 });
    expect(t.templateFor('https://example.com/u/b/edit')).toBe('/u/:param/edit');
  });

  it('is independent of URL input order and duplicates', () => {
    const shuffled = [...fixture.urls].reverse().concat(fixture.urls);
    const other = inferRouteTemplates(shuffled);
    for (const { url } of fixture.templates) {
      expect(other.templateFor(url)).toBe(templater.templateFor(url));
    }
  });

  it('templates hash-routed URLs, ignoring plain fragments', () => {
    const t = inferRouteTemplates([]);
    expect(t.templateFor('https://example.com/app#/items/42')).toBe('/app#/items/:param');
    expect(t.templateFor('https://example.com/app#top')).toBe('/app');
  });

  it('handles hosts it has not seen', () => {
    expect(templater.templateFor('https://other.example/oferta/1')).toBe('/oferta/:param');
  });

  it('drops path parameters from segments: a session id is never a route (LO-24, spec 019)', () => {
    const t = inferRouteTemplates([]);
    expect(t.templateFor('https://bank.test/legacy/bank/historia.do;jsessionid=A1B2C3')).toBe(
      '/legacy/bank/historia.do',
    );
    expect(t.templateFor('https://bank.test/a;v=1/b.do;jsessionid=Z?x=1')).toBe('/a/b.do');
    expect(t.templateFor('https://bank.test/;jsessionid=Z')).toBe('/');
  });
});
