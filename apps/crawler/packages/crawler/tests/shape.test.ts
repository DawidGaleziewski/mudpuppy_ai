import { describe, expect, it } from 'vitest';
import { looksLikeRawPayload } from '@pathfinder/core';
import { shapeOf, shapeOfBody } from '../src/shape.js';

describe('shapeOf', () => {
  it('keeps keys and type tags, never values', () => {
    const s = shapeOf({
      id: 7,
      price: 12.5,
      title: 'Laptop',
      seller: { email: 'jan@example.com', verified: true },
      tags: ['a', 'b'],
      note: null,
    });
    expect(s).toEqual({
      id: 'integer',
      price: 'number',
      title: 'string',
      seller: { email: 'string', verified: 'boolean' },
      tags: ['string'],
      note: 'null',
    });
    expect(JSON.stringify(s)).not.toContain('jan@example.com');
  });

  it('produces output the PII check accepts as shape-only', () => {
    expect(
      looksLikeRawPayload(shapeOf({ email: 'a@b.pl', phone: '601 234 567', access_token: 'abc' })),
    ).toBe(false);
  });

  it('merges heterogeneous object arrays and bounds depth', () => {
    expect(shapeOf([{ a: 1 }, { b: 'x' }])).toEqual([{ a: 'integer', b: 'string' }]);
    let deep: unknown = 1;
    for (let i = 0; i < 20; i++) deep = { x: deep };
    expect(JSON.stringify(shapeOf(deep)).length).toBeLessThan(200);
    expect(shapeOf([])).toEqual([]);
  });

  it('shapeOfBody handles json, form-encoded and unknown bodies', () => {
    expect(shapeOfBody('{"q":"laptop"}', 'application/json')).toEqual({ q: 'string' });
    expect(shapeOfBody('q=laptop&page=2', 'application/x-www-form-urlencoded')).toEqual({
      q: 'string',
      page: 'string',
    });
    expect(shapeOfBody('<html>', 'text/html')).toEqual({});
    expect(shapeOfBody('{broken', 'application/json')).toEqual({});
    expect(shapeOfBody(null, undefined)).toEqual({});
  });
});
