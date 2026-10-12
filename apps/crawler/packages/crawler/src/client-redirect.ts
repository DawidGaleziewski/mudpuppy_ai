/// <reference lib="dom" />
import type { Page } from 'playwright';

/** A meta refresh the current document announces. */
export interface MetaRefresh {
  delayMs: number;
  /** Absolute target URL (the document itself when the tag names none). */
  target: string;
}

export interface ClientRedirects {
  /** Client-side redirects waited through. */
  followed: number;
  /** A meta refresh too slow to wait for (a session-timeout warning, …): recorded, not followed. */
  pending: MetaRefresh | null;
  /** True when the hop cap stopped the wait (a redirect loop). */
  capped: boolean;
}

export interface ClientRedirectOptions {
  /** Longest refresh delay followed, and the wait per hop (portal `scope.client_redirect_wait_ms`). */
  maxWaitMs: number;
  /** A main-frame document load is in flight (from the navigation recorder). */
  navigating: () => boolean;
  maxHops?: number;
}

const MAX_HOPS = 5;
/** Time a hop's new document gets beyond the announced delay to commit. */
const GRACE_MS = 2000;

/** The document's meta refresh, if any; never throws (a page mid-navigation has none to read). */
export async function readMetaRefresh(page: Page): Promise<MetaRefresh | null> {
  const r = await probeRefresh(page);
  return r === 'navigating' ? null : r;
}

/** {@link readMetaRefresh}, telling "the document went away under us" (a redirect started) apart. */
async function probeRefresh(page: Page): Promise<MetaRefresh | null | 'navigating'> {
  try {
    return await page.evaluate(() => {
      const m = document.querySelector('meta[http-equiv="refresh" i]');
      const content = m?.getAttribute('content');
      if (!content) return null;
      const delay = Number.parseFloat(content);
      const url = /url\s*=\s*['"]?([^'"]+)/i.exec(content);
      return {
        delayMs: Number.isFinite(delay) ? Math.max(0, delay) * 1000 : 0,
        target: new URL(url ? url[1]!.trim() : location.href, location.href).href,
      };
    });
  } catch (e) {
    return /context was destroyed|navigat/i.test((e as Error).message) ? 'navigating' : null;
  }
}

const POLL_MS = 50;

/**
 * True once the main frame is on another URL than `from` (and its DOM is parsed), false after `ms`.
 * Polls the URL Playwright already tracks instead of awaiting `framenavigated`: a redirect that
 * committed before the wait began would never fire the event again.
 */
async function nextDocument(page: Page, from: string, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (page.url() === from) {
    if (Date.now() >= deadline || page.isClosed()) return false;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  try {
    await page.waitForLoadState('domcontentloaded', {
      timeout: Math.max(1, deadline - Date.now()),
    });
  } catch {
    // still loading at the bound: the settle that follows waits for it
  }
  return true;
}

/**
 * Wait through the client-side redirects of the page in front of us (spec 019 FR-007, LO-23): a meta
 * refresh with a short delay, or a document load already in flight (a script `location` change), so
 * an interstitial such as "Proszę czekać…" is passed instead of recorded as a screen. Bounded per hop
 * by `maxWaitMs` plus a grace period, and by a hop cap against loops. The browser follows the
 * redirect itself, through the request gate, so scope and robots.txt still apply.
 */
export async function followClientRedirects(
  page: Page,
  opts: ClientRedirectOptions,
): Promise<ClientRedirects> {
  const maxHops = opts.maxHops ?? MAX_HOPS;
  let followed = 0;
  while (followed < maxHops) {
    const from = page.url();
    const refresh = opts.navigating() ? 'navigating' : await probeRefresh(page);
    if (refresh === 'navigating') {
      if (!(await nextDocument(page, from, opts.maxWaitMs + GRACE_MS))) break;
      followed++;
      continue;
    }
    if (refresh === null) return { followed, pending: null, capped: false };
    // A page that refreshes itself (live data) is not a redirect: following it only reloads it.
    const self = refresh.target.split('#')[0] === page.url().split('#')[0];
    if (self || refresh.delayMs > opts.maxWaitMs)
      return { followed, pending: refresh, capped: false };
    if (!(await nextDocument(page, from, refresh.delayMs + GRACE_MS))) break;
    followed++;
  }
  return { followed, pending: null, capped: followed >= maxHops };
}
