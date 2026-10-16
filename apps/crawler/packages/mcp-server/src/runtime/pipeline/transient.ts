// Intermittent error pages (spec 030 FR-043, scar SC-17, owner 2026-10-15): a page that answers a
// 5xx or only says a technical error happened is re-opened before it is observed, so an error page
// never becomes a screen in place of the real one and the BA documents the real screens. The page is
// re-opened with a GET through the session's gates (never a reload: that could re-post a form).

import { transientError, type SettleOutcome, type TransientKind } from '@pathfinder/crawler';
import { shapeUrl } from '@pathfinder/trace';
import type { RunState } from '../run-state.js';
import { decision, event, type Report } from './context.js';

/** At most this many re-opens per page: a page still failing after them is recorded as it is. */
export const TRANSIENT_RETRIES = 2;
const RETRY_PAUSE_MS = 1000;

/** The main document's status and the page text, read in the page (a string: no `__name`). */
const HEALTH_PROBE = `(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  return {
    status: nav && typeof nav.responseStatus === 'number' ? nav.responseStatus : 0,
    text: document.body ? document.body.innerText.slice(0, 2000) : '',
  };
})()`;

async function kindNow(rs: RunState): Promise<TransientKind | null> {
  const page = rs.session.page;
  const health = (await page.evaluate(HEALTH_PROBE).catch(() => null)) as {
    status: number;
    text: string;
  } | null;
  if (!health) return null;
  return transientError({
    ...(health.status > 0 ? { status: health.status } : {}),
    text: health.text,
  });
}

export interface TransientRetries<T> {
  /** The settle outcome after the last re-open, when there was one. */
  outcome: T | null;
  reports: Report[];
}

/** Re-open the current URL while it shows a transient error, up to {@link TRANSIENT_RETRIES}. */
export async function retryTransientErrors<T extends SettleOutcome>(
  rs: RunState,
  settle: () => Promise<T>,
): Promise<TransientRetries<T>> {
  const reports: Report[] = [];
  let outcome: T | null = null;
  for (let attempt = 1; attempt <= TRANSIENT_RETRIES; attempt++) {
    const kind = await kindNow(rs);
    if (kind === null) return { outcome, reports };
    const url = rs.session.page.url();
    await new Promise((r) => setTimeout(r, RETRY_PAUSE_MS));
    await rs.session.goto(url);
    outcome = await settle();
    const recovered = (await kindNow(rs)) === null;
    const shaped = shapeUrl(url, (u) => rs.peekRouteTemplate(u));
    reports.push(
      event('transient_error', { kind, attempt, recovered, url: shaped }),
      decision({
        kind: 'note',
        rule: 'transient_error',
        reason: `${kind === 'http_5xx' ? 'the server answered an error' : 'the page only reported a technical error'}; re-opened it (attempt ${String(attempt)}), ${recovered ? 'the real page came back' : 'still failing'}`,
        subject_ref: url,
        detail: { kind, attempt, recovered, url },
      }),
    );
    if (recovered) break;
  }
  return { outcome, reports };
}
