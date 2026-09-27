import { describe, expect, it } from 'vitest';
import { shapeUrl } from '../src/trace/url-shape.js';

describe('shapeUrl', () => {
  it('keeps origin and path, drops query values and the fragment', () => {
    expect(shapeUrl('https://example.test/oferty/123?b=2&a=secret#top')).toEqual({
      origin: 'https://example.test',
      route: '/oferty/123',
      query_keys: ['a', 'b'],
    });
  });

  it('drops credentials in the authority', () => {
    expect(shapeUrl('https://user:pass@example.test/x').origin).toBe('https://example.test');
  });

  it('lists each query key once', () => {
    expect(shapeUrl('https://example.test/?a=1&a=2&c=').query_keys).toEqual(['a', 'c']);
  });

  it('uses the route template when one is given', () => {
    const shaped = shapeUrl('https://example.test/oferty/123', () => '/oferty/:id');
    expect(shaped.route).toBe('/oferty/:id');
  });

  it('falls back to the pathname when the templater throws', () => {
    const shaped = shapeUrl('https://example.test/a/b', () => {
      throw new Error('boom');
    });
    expect(shaped.route).toBe('/a/b');
  });

  it('masks PII that sits in the path', () => {
    const shaped = shapeUrl('https://example.test/konto/test.user@example.test/profil');
    expect(shaped.route).not.toContain('test.user@example.test');
    expect(shaped.route).toContain('[email]');
  });

  it('never stores the body of data: or blob: URLs', () => {
    expect(shapeUrl('data:image/png;base64,iVBORw0KGgo=')).toEqual({
      origin: null,
      route: '<data>',
      query_keys: [],
    });
    expect(shapeUrl('blob:https://example.test/5f0c-uuid').route).toBe('<blob>');
  });

  it('marks an unparseable URL instead of storing it', () => {
    expect(shapeUrl('not a url')).toEqual({ origin: null, route: '<unparseable>', query_keys: [] });
  });
});
