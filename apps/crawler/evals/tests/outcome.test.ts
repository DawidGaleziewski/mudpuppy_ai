import { describe, expect, it } from 'vitest';
import { classifyOutcome, SCORED_OUTCOMES } from '../harness/outcome.js';

describe('classifyOutcome (spec 014 F-04)', () => {
  it('an answer without an error is a success', () => {
    expect(classifyOutcome({ result: 'Mapped 12 states.', subtype: 'success' })).toBe('success');
  });

  it("running out of the eval's own budget is a fair end", () => {
    expect(classifyOutcome({ is_error: true, subtype: 'error_max_budget_usd' })).toBe('budget_end');
  });

  it('any other CLI error is an API error', () => {
    expect(classifyOutcome({ is_error: true, subtype: 'error_during_execution' })).toBe(
      'api_error',
    );
  });

  it.each([
    "You've hit your session limit · resets 3am",
    'API Error: 429 rate_limit_error',
    'Claude usage limit reached.',
  ])('the account limit is a usage limit, error flag or not: %s', (result) => {
    expect(classifyOutcome({ result })).toBe('usage_limit');
    expect(classifyOutcome({ result, is_error: true, subtype: 'success' })).toBe('usage_limit');
  });

  it('a limit wins over a budget end: the session was cut off', () => {
    expect(
      classifyOutcome({
        result: "You've hit your session limit",
        is_error: true,
        subtype: 'error_max_budget_usd',
      }),
    ).toBe('usage_limit');
  });

  it('only success and budget end are scored', () => {
    expect([...SCORED_OUTCOMES].sort()).toEqual(['budget_end', 'success']);
  });
});
