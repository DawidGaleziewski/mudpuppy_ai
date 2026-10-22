// The login's transit zone (spec 037 FR-004…FR-006, R-62 Q3 decided 2026-10-16: learned, not
// declared). Every host other than the portal's own that the browser enters while `login` runs is
// transit for that login: the run's scope does not fence it out, a URL-only success sign does not
// count there, and each page that settles on it is kept with evidence and marked transit on the
// landing page's hops, never dropped (they matter for a migration) and never explored.

import { maskText, SECRETS, type NavigationHop } from '@mudpuppy/core';
import { captureAria } from '@mudpuppy/crawler';
import type { RunScope } from '@mudpuppy/safety';
import type { ServerContext } from '../context.js';
import type { RunState } from './run-state.js';

/** A page the browser showed on a transit host during a login. */
export interface TransitPage {
  url: string;
  title: string;
  evidence_ref: string;
  /** Left out when the page shows a registered secret: a screenshot cannot be redacted. */
  screenshot_ref?: string;
}

/** What one login learned: the hosts it passed and the pages it kept. */
export interface TransitZone {
  hosts: Set<string>;
  pages: TransitPage[];
}

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
};

/** Start a login's zone: nothing learned yet. */
export const openZone = (): TransitZone => ({ hosts: new Set(), pages: [] });

/** Note the host of a main-frame navigation during a login when it is not the portal's own. */
export function noteHost(rs: RunState, url: string): void {
  const host = hostOf(url);
  if (rs.transit === null || host === null || !/^https?:/.test(url)) return;
  if (host !== hostOf(rs.effective.portal.base_url)) rs.transit.hosts.add(host);
}

/** True while a login runs and the browser is on one of its transit hosts. */
export function inTransit(rs: RunState, url: string): boolean {
  const host = hostOf(url);
  return rs.loggingIn && rs.transit !== null && host !== null && rs.transit.hosts.has(host);
}

/**
 * The run's scope while a login runs (FR-004): any domain, and the URL lists without their
 * `allowed` entries; `disallowed` lists and every other rule (robots, denylist, limits) still apply.
 */
export function loginScope(scope: RunScope): RunScope {
  return {
    ...scope,
    external_link_policy: 'follow',
    url_lists: scope.url_lists.map(({ where, lists }) => ({
      where,
      lists: lists.disallowed ? { disallowed: lists.disallowed } : {},
    })),
  };
}

/**
 * Keep the page in front of the browser when it is a transit page not kept yet (FR-006): masked
 * snapshot as text evidence (the evidence store also redacts secrets), and a screenshot unless the
 * page shows a registered secret. Best effort: a page that navigates away meanwhile is skipped.
 */
export async function keepTransitPage(ctx: ServerContext, rs: RunState): Promise<void> {
  const page = rs.session.page;
  const url = page.url();
  if (!inTransit(rs, url)) return;
  const zone = rs.transit!;
  const shown = rs.effective.portal.pii_scrub ? maskText(url) : url;
  if (zone.pages.some((p) => p.url === shown)) return;
  try {
    const snapshot = await captureAria(page);
    const text = await page.locator('body').innerText({ timeout: 1000 });
    const kept: TransitPage = {
      url: shown,
      title: await page.title(),
      evidence_ref: await ctx.evidence.storeText(
        rs.effective.portal.pii_scrub ? maskText(snapshot) : snapshot,
        'yaml',
      ),
    };
    if (SECRETS.redact(text) === text)
      kept.screenshot_ref = await ctx.evidence.storeBinary(
        await page.screenshot({ type: 'png', timeout: 3000 }),
        'png',
      );
    if (page.url() === url) zone.pages.push(kept);
  } catch {
    // The page moved on mid-capture (a script redirect): the hop is still recorded.
  }
}

const sameDocument = (a: string, b: string): boolean => a.split('#')[0] === b.split('#')[0];

/**
 * The login's hops with the zone marked (FR-006): a hop on a transit host is `transit`, and a kept
 * page adds its title and evidence to its hop; a kept page without a hop is added after the last.
 */
export function markTransitHops(hops: NavigationHop[], zone: TransitZone): NavigationHop[] {
  const left = [...zone.pages];
  const out = hops.map((h): NavigationHop => {
    const host = hostOf(h.url);
    if (host === null || !zone.hosts.has(host)) return h;
    const i = left.findIndex((p) => sameDocument(p.url, h.url));
    const page = i < 0 ? undefined : left.splice(i, 1)[0];
    return { ...h, transit: true, ...(page ? pageFields(page) : {}) };
  });
  for (const p of left)
    out.push({ url: p.url, kind: 'same_document', transit: true, ...pageFields(p) });
  return out;
}

const pageFields = (p: TransitPage) => ({
  title: p.title,
  evidence_ref: p.evidence_ref,
  ...(p.screenshot_ref ? { screenshot_ref: p.screenshot_ref } : {}),
});
