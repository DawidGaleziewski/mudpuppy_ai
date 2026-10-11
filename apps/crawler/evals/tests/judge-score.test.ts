import { expect, it } from 'vitest';
import type { Pair } from '../graders/model/definition.js';
import { summarise, type Verdict } from '../graders/model/score.js';

const pair = (itemId: string, key: string): Pair => ({
  id: `${itemId}~${key}@1`,
  itemId,
  item: itemId,
  record: { key, rev: 1, kind: 'glossary_term', text: key },
});
const v = (p: Pair, verdict: Verdict['verdict']): Verdict => ({
  pairId: p.id,
  verdict,
  reason: 'r',
});

it('covers an item when one of its pairs passes, and counts every verdict', () => {
  const a1 = pair('T01', 'GL-1');
  const a2 = pair('T01', 'GL-2');
  const b1 = pair('T02', 'GL-3');
  const c1 = pair('T03', 'GL-4');
  const score = summarise(
    ['T01', 'T02', 'T03', 'T04'],
    [a1, a2, b1, c1],
    [v(a1, 'fail'), v(a2, 'pass'), v(b1, 'unknown'), v(c1, 'error')],
  );
  // T02 unknown and T03 error never cover; T04 had no candidates and is not covered.
  expect(score).toEqual({
    covered: 1,
    total: 4,
    pct: 25,
    counts: { pass: 1, fail: 1, unknown: 1, error: 1 },
  });
});

it('scores an empty category 0, never 100 % (create-eval skill)', () => {
  expect(summarise([], [], []).pct).toBe(0);
});
