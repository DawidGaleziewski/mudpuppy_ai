import { describe, expect, it } from 'vitest';
import { defineJudge, type Pair } from '../graders/model/definition.js';
import { systemPrompt, userMessage } from '../graders/model/prompt.js';

const judge = defineJudge({
  id: 'glossary-terms',
  category: 'terms',
  question: 'Does this glossary record name the same portal term?',
  pass: 'The same term, allowing case and an abbreviation in brackets.',
  fail: 'A different, broader or narrower term.',
  examples: [
    {
      item: 'OC',
      record: 'term_verbatim: NNW',
      verdict: 'fail',
      reason: 'NNW is another product.',
    },
  ],
  selectPairs: () => [],
});

const pair: Pair = {
  id: 'T02~GL-002@1',
  itemId: 'T02',
  item: 'Autocasco (AC)',
  record: { key: 'GL-002', rev: 1, kind: 'glossary_term', text: 'term_verbatim: Autocasco (AC)' },
};

describe('systemPrompt', () => {
  const text = systemPrompt(judge);

  it('carries the question, the pass and fail definitions and each example', () => {
    expect(text).toContain(judge.question);
    expect(text).toContain(judge.pass);
    expect(text).toContain(judge.fail);
    expect(text).toContain('NNW is another product.');
    expect(text).toContain('Verdict: fail');
  });

  it('defends against leniency and asks for the reason first', () => {
    expect(text).toContain('does not clearly state it, answer fail');
    expect(text).toContain('reason first');
  });

  it('has no examples section when there are none', () => {
    expect(systemPrompt({ ...judge, examples: [] })).not.toContain('Examples');
  });
});

it('userMessage holds exactly the item and the record', () => {
  const text = userMessage(pair);
  expect(text).toBe(
    '<item>\nAutocasco (AC)\n</item>\n\n<record>\nterm_verbatim: Autocasco (AC)\n</record>',
  );
});
