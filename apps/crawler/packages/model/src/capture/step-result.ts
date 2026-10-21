/**
 * Step results (spec 039 design § 5.6): what an observation or transition came to. Pure.
 */

export const STEP_RESULTS = [
  'ok',
  'validation',
  'business_error',
  'technical_error',
  'timeout',
  'blocked',
] as const;
export type StepResult = (typeof STEP_RESULTS)[number];

export interface StepSignals {
  /** The safety gate refused the action; nothing was sent. */
  blocked: boolean;
  /** The browser showed its own error page (`chrome-error://`, net::ERR_…). */
  browserErrorPage: boolean;
  /** HTTP status of the document, when one loaded. */
  documentStatus?: number;
  /** Statuses of requests the page needed to render (scripts, styles, the calls it waited on). */
  blockingStatuses?: readonly number[];
  /** Settle finished (`stabilization = settled`). */
  settled: boolean;
  /** Today's validation signals fired (invalid controls, alert texts after a submit). */
  validation: boolean;
  /** The page text, to match business error templates against. */
  pageText: string;
  /** Business error templates (portal hook or confirmed hypotheses). */
  businessErrors: readonly string[];
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The result, by precedence: a refused action is `blocked` (nothing happened); a server or browser
 * failure is `technical_error`; a page matching a business error template is `business_error`
 * (a refusal to insure is an answer, not a validation message); then `validation`; a page that
 * never settled is `timeout`; else `ok` (F-05@039: the design's table has no precedence).
 */
export function stepResult(s: StepSignals): StepResult {
  if (s.blocked) return 'blocked';
  if (s.browserErrorPage) return 'technical_error';
  if ((s.documentStatus ?? 0) >= 500 || (s.blockingStatuses ?? []).some((c) => c >= 500))
    return 'technical_error';
  const text = norm(s.pageText);
  if (s.businessErrors.some((t) => t.trim() && text.includes(norm(t)))) return 'business_error';
  if (s.validation) return 'validation';
  if (!s.settled) return 'timeout';
  return 'ok';
}
