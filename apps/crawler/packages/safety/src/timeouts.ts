/**
 * The crawl timeouts for one page (spec 023 US4): the first `timeouts.per_url` entry whose `match`
 * fits the URL, then the portal's `timeouts`, then the scope values and the built-in defaults.
 * Pure.
 */

import type { Scope, Timeouts } from '@pathfinder/config';
import { matchUrlEntry } from './url-lists.js';

export interface PageTimeouts {
  settle_ms: number;
  settle_hard_ms: number;
  navigation_ms: number;
  mfe_wait_ms: number;
  mfe_quiet_ms: number;
  client_redirect_wait_ms: number;
  /** The `per_url` entry that applied, if any. */
  matched: string | null;
}

export const DEFAULT_SETTLE_MS = 10_000;
/** The shared wait (spec 031 US1): a page still loading new parts is given up to this. */
export const DEFAULT_SETTLE_HARD_MS = 30_000;
export const DEFAULT_NAVIGATION_MS = 30_000;
/** The mount wait ends after this long without progress (above LO-53's 1.5 s quiet mount). */
export const DEFAULT_MFE_QUIET_MS = 3_000;

type Key =
  | 'settle_ms'
  | 'settle_hard_ms'
  | 'navigation_ms'
  | 'mfe_wait_ms'
  | 'mfe_quiet_ms'
  | 'client_redirect_wait_ms';

export function pageTimeouts(
  timeouts: Timeouts | undefined,
  scope: Pick<Scope, 'mfe_wait_ms' | 'client_redirect_wait_ms'>,
  url: string,
): PageTimeouts {
  const hit = timeouts?.per_url.find((p) => matchUrlEntry(p.match, url));
  const pick = (key: Key, fallback: number): number => hit?.[key] ?? timeouts?.[key] ?? fallback;
  return {
    settle_ms: pick('settle_ms', DEFAULT_SETTLE_MS),
    settle_hard_ms: pick('settle_hard_ms', DEFAULT_SETTLE_HARD_MS),
    navigation_ms: pick('navigation_ms', DEFAULT_NAVIGATION_MS),
    mfe_wait_ms: pick('mfe_wait_ms', scope.mfe_wait_ms),
    mfe_quiet_ms: pick('mfe_quiet_ms', DEFAULT_MFE_QUIET_MS),
    client_redirect_wait_ms: pick('client_redirect_wait_ms', scope.client_redirect_wait_ms),
    matched: hit?.match ?? null,
  };
}
