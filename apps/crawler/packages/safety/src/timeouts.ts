/**
 * The crawl timeouts for one page (spec 023 US4): the first `timeouts.per_url` entry whose `match`
 * fits the URL, then the portal's `timeouts`, then the scope values and the built-in defaults.
 * Pure.
 */

import type { Scope, Timeouts } from '@pathfinder/config';
import { matchUrlEntry } from './url-lists.js';

export interface PageTimeouts {
  settle_ms: number;
  navigation_ms: number;
  mfe_wait_ms: number;
  client_redirect_wait_ms: number;
  /** The `per_url` entry that applied, if any. */
  matched: string | null;
}

export const DEFAULT_SETTLE_MS = 10_000;
export const DEFAULT_NAVIGATION_MS = 30_000;

export function pageTimeouts(
  timeouts: Timeouts | undefined,
  scope: Pick<Scope, 'mfe_wait_ms' | 'client_redirect_wait_ms'>,
  url: string,
): PageTimeouts {
  const hit = timeouts?.per_url.find((p) => matchUrlEntry(p.match, url));
  const pick = <
    K extends 'settle_ms' | 'navigation_ms' | 'mfe_wait_ms' | 'client_redirect_wait_ms',
  >(
    key: K,
    fallback: number,
  ): number => hit?.[key] ?? timeouts?.[key] ?? fallback;
  return {
    settle_ms: pick('settle_ms', DEFAULT_SETTLE_MS),
    navigation_ms: pick('navigation_ms', DEFAULT_NAVIGATION_MS),
    mfe_wait_ms: pick('mfe_wait_ms', scope.mfe_wait_ms),
    client_redirect_wait_ms: pick('client_redirect_wait_ms', scope.client_redirect_wait_ms),
    matched: hit?.match ?? null,
  };
}
