import { expect, it } from 'vitest';
import { addCost, emptyCost } from '../harness/cost.js';

it('sums sessions, counting cache reads and writes as input', () => {
  const crawler = {
    total_cost_usd: 1.5,
    duration_ms: 1000,
    usage: {
      input_tokens: 10,
      cache_read_input_tokens: 100,
      cache_creation_input_tokens: 5,
      output_tokens: 7,
    },
  };
  const ba = { total_cost_usd: 0.5, duration_ms: 500, usage: { output_tokens: 3 } };
  expect(addCost(addCost(emptyCost(), crawler), ba)).toEqual({
    usd: 2,
    input_tokens: 115,
    output_tokens: 10,
    duration_ms: 1500,
  });
});

it('treats missing fields (a session that gave no usage) as zero', () => {
  expect(addCost(emptyCost(), {})).toEqual(emptyCost());
});
