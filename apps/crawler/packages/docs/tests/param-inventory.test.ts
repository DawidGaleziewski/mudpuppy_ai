import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAX_ENTRY_URLS,
  MAX_VALUES,
  parameterInventory,
  type VisitRow,
} from '../src/param-inventory.js';

const FIXTURE = JSON.parse(
  readFileSync(
    new URL('../../../tests/fixtures/params/param-inventory.json', import.meta.url),
    'utf8',
  ),
) as { visits: VisitRow[]; expected: unknown };

const visit = (url: string, i: number): VisitRow => ({
  id: `v${i}`,
  state_id: 'S',
  edge_id: null,
  via: 'navigate',
  url,
  hops: [{ url, kind: 'start' }],
});

describe('parameterInventory (spec 019, R-37/R-38)', () => {
  it('builds the shared fixture inventory (the dashboard reads the same file)', () => {
    expect(parameterInventory(FIXTURE.visits)).toEqual(FIXTURE.expected);
  });

  it('bounds the values kept and the entry URLs listed, and counts the rest', () => {
    const many = Array.from({ length: MAX_ENTRY_URLS + 5 }, (_, i) =>
      visit(`http://x.test/a?n=${i}`, i),
    );
    const [s] = parameterInventory(many);
    expect(s!.entry_urls).toHaveLength(MAX_ENTRY_URLS);
    expect(s!.entry_urls_more).toBe(5);
    expect(s!.params[0]!.values).toHaveLength(MAX_VALUES);
    expect(s!.params[0]!.distinct).toBe(MAX_ENTRY_URLS + 5);
    expect(s!.entry_urls[0]!.hop_kinds).toEqual([]);
  });

  it('counts a repeated parameter once per visit, keeping both values', () => {
    const [s] = parameterInventory([visit('http://x.test/a?a=1&a=2', 1)]);
    expect(s!.params).toEqual([
      {
        name: 'a',
        in: 'query',
        visits: 1,
        values: ['1', '2'],
        distinct: 2,
        set_by: [{ edge_id: null, hop: 'navigate' }],
      },
    ]);
  });
});
