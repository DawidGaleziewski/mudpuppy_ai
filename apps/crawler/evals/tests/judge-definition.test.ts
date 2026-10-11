import { describe, expect, it } from 'vitest';
import { defineJudge, judgeVersion, pairId } from '../graders/model/definition.js';

const base = {
  id: 'glossary-terms',
  category: 'terms' as const,
  question: 'Same term?',
  pass: 'Same term.',
  fail: 'Different or unclear.',
  examples: [],
  selectPairs: () => [],
};

describe('defineJudge', () => {
  it('defaults the model to sonnet', () => {
    expect(defineJudge(base).model).toBe('sonnet');
  });

  it('refuses a non-kebab id, more than five examples and empty wording', () => {
    expect(() => defineJudge({ ...base, id: 'Glossary_terms' })).toThrow(/kebab/);
    const ex = { item: 'a', record: 'b', verdict: 'pass' as const, reason: 'c' };
    expect(() => defineJudge({ ...base, examples: Array(6).fill(ex) })).toThrow(/at most 5/);
    expect(() => defineJudge({ ...base, fail: '  ' })).toThrow(/empty fail/);
  });
});

describe('judgeVersion', () => {
  const v = judgeVersion(defineJudge(base));

  it('is stable for the same wording', () => {
    expect(judgeVersion(defineJudge(base))).toBe(v);
    expect(v).toMatch(/^[0-9a-f]{12}$/);
  });

  it('changes with the question, pass, fail, examples or model', () => {
    const ex = { item: 'a', record: 'b', verdict: 'fail' as const, reason: 'c' };
    for (const change of [
      { question: 'Same portal term?' },
      { pass: 'Same.' },
      { fail: 'Not the same.' },
      { examples: [ex] },
      { model: 'opus' },
    ])
      expect(judgeVersion(defineJudge({ ...base, ...change }))).not.toBe(v);
  });

  it('does not change with the selector (code, not wording)', () => {
    expect(judgeVersion(defineJudge({ ...base, selectPairs: () => [] }))).toBe(v);
  });
});

it('builds the stable pair id', () => {
  expect(pairId('T02', 'GL-002', 1)).toBe('T02~GL-002@1');
});
