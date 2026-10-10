/**
 * What the agent sessions of one eval cost, summed from the CLI's JSON output.
 */
import type { CliOut } from './agent.js';

export interface Cost {
  usd: number;
  /** Fresh plus cache-read plus cache-write input tokens: everything the model read. */
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
}

export function emptyCost(): Cost {
  return { usd: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0 };
}

export function addCost(cost: Cost, o: CliOut): Cost {
  return {
    usd: cost.usd + (o.total_cost_usd ?? 0),
    input_tokens:
      cost.input_tokens +
      (o.usage?.input_tokens ?? 0) +
      (o.usage?.cache_read_input_tokens ?? 0) +
      (o.usage?.cache_creation_input_tokens ?? 0),
    output_tokens: cost.output_tokens + (o.usage?.output_tokens ?? 0),
    duration_ms: cost.duration_ms + (o.duration_ms ?? 0),
  };
}
