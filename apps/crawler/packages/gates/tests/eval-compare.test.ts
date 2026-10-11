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

  it('treats a positive password_hits or widget_actions as a regression with or without a baseline', () => {
    const now = { ...base, checks: { ...base.checks, password_hits: 2, widget_actions: 1 } };
    const expected = ['check:password_hits', 'check:widget_actions'];
    expect(compareEval(now, null).regressions).toEqual(expected);
    const zero = { ...base, checks: { ...base.checks, password_hits: 0, widget_actions: 0 } };
    expect(compareEval(now, zero).regressions).toEqual(expected);
  });

  it('does not flag hard-zero checks that are 0', () => {
    const zero = { ...base, checks: { ...base.checks, password_hits: 0, widget_actions: 0 } };
    expect(compareEval(zero, zero).regressions).toEqual([]);
    expect(compareEval(zero, null).regressions).toEqual([]);
  });
});

describe('EvalResult schema and conditions', () => {
  it('parses old files and files with the new optional fields', () => {
    expect(EvalResult.safeParse(base).success).toBe(true);
    const next = EvalResult.parse({
      ...base,
      conditions: { session_timeout_s: 1800 },
      runs: { ...base.runs, crawler_cli_session: 'cli-1', ba_cli_session: null },
    });
    expect(next.conditions?.session_timeout_s).toBe(1800);
    expect(EvalResult.safeParse({ ...base, conditions: { other: 1 } }).success).toBe(false);
  });

  it('parses workspace and judges, which never change the comparison (spec 017)', () => {
    const judge = {
      id: 'glossary-terms',
      version: 'abc123def456',
      model: 'claude-sonnet-5-5',
      claude_code_version: '2.1.288',
      calibrated: false,
      covered: 8,
      total: 10,
      pct: 80,
      counts: { pass: 9, fail: 3, unknown: 1, error: 0 },
      skipped_pairs: 0,
      cost: { usd: 0.07, input_tokens: 13000, output_tokens: 1600, calls: 13 },
      verdicts: [{ pair_id: 'T02~GL-002@1', verdict: 'pass' as const, reason: 'Same term.' }],
    };
    const now = EvalResult.parse({ ...base, workspace: '/tmp/pf-eval-x', judges: [judge] });
    expect(compareEval(now, base)).toEqual(compareEval(base, base));
    expect(compareEval(base, now)).toEqual(compareEval(base, base));
    const md = comparisonMarkdown(now, compareEval(now, base));
    expect(md).toContain('- glossary-terms (vabc123def456, uncalibrated): 8/10 (80 %)');
    expect(comparisonMarkdown(base, compareEval(base, base))).not.toContain('Judges');
    expect(
      EvalResult.safeParse({
        ...base,
        judges: [{ ...judge, verdicts: [{ pair_id: 'x', verdict: 'maybe', reason: '' }] }],
      }).success,
    ).toBe(false);
  });

  it('prints the session timeout under the runs line', () => {
    const now = { ...base, conditions: { session_timeout_s: 1800 } };
    const md = comparisonMarkdown(now, compareEval(now, base));
    expect(md).toContain('conditions: session timeout 1800 s');
    expect(comparisonMarkdown(base, compareEval(base, base))).not.toContain('conditions:');
  });
});
