/**
 * How one headless agent session ended (spec 014 F-04, spec 020 T002). Only a fair end may become
 * a result: the agent finished, or used up the eval's own budget. An API error or the account's
 * usage limit measures the outage, not the agent.
 */
import { ScoredOutcome as ScoredOutcomeSchema } from '@mudpuppy/gates';
import type { z } from 'zod';

export type AgentOutcome = 'success' | 'budget_end' | 'api_error' | 'usage_limit';

/** The fields of `claude --output-format json` the classification reads. */
export interface CliEnd {
  result?: string;
  is_error?: boolean;
  subtype?: string;
}

/** The CLI's answer when the account's session or rate limit cuts the agent off. */
const LIMIT = /hit your .*limit|usage limit|rate.?limit/i;

export function classifyOutcome(out: CliEnd): AgentOutcome {
  if (LIMIT.test(out.result ?? '')) return 'usage_limit';
  if (out.subtype === 'error_max_budget_usd') return 'budget_end';
  if (out.is_error === true) return 'api_error';
  return 'success';
}

/** Outcomes a result may be written for: one list, the result schema's (`EvalResult.outcomes`). */
export type ScoredOutcome = z.infer<typeof ScoredOutcomeSchema>;
export const SCORED_OUTCOMES: ReadonlySet<AgentOutcome> = new Set(ScoredOutcomeSchema.options);

export const isScored = (o: AgentOutcome): o is ScoredOutcome => SCORED_OUTCOMES.has(o);
