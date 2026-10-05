import { describe, expect, it } from 'vitest';
import { compareEval, comparisonMarkdown, EvalResult } from '../src/eval.js';

const base: EvalResult = EvalResult.parse({
  portal_id: 'reference-insurer',
  persona_id: 'guest',
  started_at: '2026-10-05T03:00:00Z',
  git_sha: 'abc1234',
  runs: { crawler: 'run-1', ba_session: 'sess-1' },
  cost: { usd: 1.5, input_tokens: 1000, output_tokens: 200, duration_ms: 60_000 },
  scores: {
    screens: { matched: 10, total: 10, pct: 100 },
    rules: { matched: 7, total: 10, pct: 70 },
  },
  overclaims: 0,
  checks: { frontier_empty_at_finish: true, handoffs: 1 },
});

describe('compareEval (pure)', () => {
  it('passes small drops within the tolerance and flags larger ones', () => {
    const now = { ...base, scores: { ...base.scores, rules: { matched: 6, total: 10, pct: 60 } } };
    expect(compareEval(now, base).regressions).toEqual(['rules']);
    expect(compareEval(now, base, { rules: 15 }).regressions).toEqual([]);
    const slight = {
      ...base,
      scores: { ...base.scores, screens: { matched: 19, total: 20, pct: 95 } },
    };
    expect(compareEval(slight, base).regressions).toEqual([]);
  });

  it('flags a check that flips to false, more over-claims and a lost category', () => {
    const now = {
      ...base,
      overclaims: 1,
      scores: { screens: base.scores.screens! },
      checks: { frontier_empty_at_finish: false, handoffs: 1 },
    };
    expect(compareEval(now, base).regressions).toEqual([
      'rules',
      'overclaims',
      'check:frontier_empty_at_finish',
    ]);
  });

  it('never regresses without a baseline, and new categories are not regressions', () => {
    const now = {
      ...base,
      scores: { ...base.scores, obstacles: { matched: 1, total: 4, pct: 25 } },
    };
    expect(compareEval(now, null).regressions).toEqual([]);
    expect(compareEval(now, base).regressions).toEqual([]);
    expect(comparisonMarkdown(now, compareEval(now, base))).toContain('| obstacles | – | 25 |');
  });
});
