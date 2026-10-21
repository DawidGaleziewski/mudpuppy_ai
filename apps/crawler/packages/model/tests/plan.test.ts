import { describe, expect, it } from 'vitest';
import { boundaryGraph, correlationIds, endpointFamily, plan } from '../src/index.js';

describe('planner (design § 14.1)', () => {
  it('orders by priority, then by anchored docs, and keeps to the budget', () => {
    const items = plan(
      {
        rulesOnNewEpoch: [],
        replays: [{ deviation: 'D1', anchoredDocs: 0 }],
        testing: [{ hypothesis: 'H-0002', anchoredDocs: 5 }],
        untested: [
          { transition: 'T1', anchoredDocs: 0 },
          { transition: 'T2', anchoredDocs: 3 },
        ],
        thinDecisionPoints: [],
        unexplored: [{ process: 'PRC-001', anchoredDocs: 9 }],
      },
      3,
    );
    expect(items.map((i) => `${i.priority}:${i.subject}`)).toEqual(['2:D1', '3:H-0002', '4:T2']);
  });
});

describe('process boundary signals (design § 13.2–13.3)', () => {
  it('names an endpoint family by the path up to its first parameter', () => {
    expect(endpointFamily('/api/quote/:param/price')).toBe('/api/quote/*');
    expect(endpointFamily('/api/regions')).toBe('/api/regions');
  });

  it('finds a quote id returned by one call and sent by later ones', () => {
    const ids = correlationIds(
      [
        {
          seq: 1,
          method: 'POST',
          urlTemplate: '/api/quote',
          url: 'https://p.pl/api/quote',
          response: { quote: { id: 'Q7731' } },
        },
        {
          seq: 2,
          method: 'GET',
          urlTemplate: '/api/quote/:param/price',
          url: 'https://p.pl/api/quote/Q7731/price',
        },
        {
          seq: 4,
          method: 'POST',
          urlTemplate: '/api/purchase',
          url: 'https://p.pl/api/purchase',
          request: { quoteId: 'Q7731' },
        },
      ],
      (v) => `h(${v})`,
    );
    expect(ids).toEqual([
      {
        keyPath: 'response:$.quote.id',
        valueHash: 'h(Q7731)',
        endpointFamily: '/api/quote',
        first: 1,
        last: 4,
      },
    ]);
  });

  it('weights pairs by shared ids, scopes, families, form and links', () => {
    const edges = boundaryGraph(
      [
        { screen: 'A', scopes: ['mfe:/quote'], families: ['/api/quote/*'], form: 'f1' },
        { screen: 'B', scopes: ['mfe:/quote'], families: ['/api/quote/*'], form: 'f1' },
        { screen: 'C', scopes: [], families: [], form: null },
      ],
      new Set(['A\u0000B', 'B\u0000C']),
      new Set(['A\u0000B']),
    );
    expect(edges).toEqual([
      { a: 'A', b: 'B', w: 3 + 2 + 2 + 1 + 1 },
      { a: 'B', b: 'C', w: 1 },
    ]);
  });
});
