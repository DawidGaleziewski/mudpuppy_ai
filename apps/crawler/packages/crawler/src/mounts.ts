/// <reference lib="dom" />
import type { CompositionLoader } from '@mudpuppy/core';
import type { Frame, Page } from 'playwright';
import { monotonicNow } from './clock.js';
import { waitForCondition } from './condition-wait.js';
import { evalWithHelpers } from './in-page.js';

/** A micro-frontend mount point and whether something rendered into it (spec 015 R4, LO-02). */
export interface MountPoint {
  selector: string;
  filled: boolean;
}

export interface MountProbe {
  mounts: MountPoint[];
  loaders: CompositionLoader[];
  /** Script resources loaded by script, not named by a `<script src>` of the document: bundles. */
  bundles: string[];
}

export interface MountWait extends MountProbe {
  waitedMs: number;
  /** True when a mount was still empty when the wait ran out. */
  timedOut: boolean;
}

// ---- In-page helpers (serialised by source, no closures). ----

/** Where front ends mount: framework roots and explicit mount markers; ids are fine here. */
function pfMountSelector(): string {
  return '#root, #app, [data-mfe], [id*="mount" i], [data-reactroot], [ng-version]';
}

/** Something rendered: text, a control or media, or a shadow root with content. */
function pfFilled(el: Element): boolean {
  if ((el as HTMLElement).innerText?.trim()) return true;
  if (el.querySelector('img, input, button, select, textarea, svg, canvas, iframe, video'))
    return true;
  for (const d of [el, ...el.querySelectorAll('*')])
    if (d.shadowRoot && d.shadowRoot.childElementCount > 0) return true;
  return false;
}

function pfDescribeMount(el: Element): string {
  if (el.id) return `#${el.id}`;
  const mfe = el.getAttribute('data-mfe');
  if (mfe !== null) return `[data-mfe="${mfe}"]`;
  return el.tagName.toLowerCase();
}

function pfLoaders(): CompositionLoader[] {
  const w = window as unknown as Record<string, unknown>;
  const out: CompositionLoader[] = [];
  if (document.querySelector('script[type="importmap"]')) out.push('importmap');
  if (document.querySelector('script[type="systemjs-importmap"]') || w.System) out.push('systemjs');
  // AMD's `define` is a function carrying an `amd` property.
  const define = w.define as ((...a: unknown[]) => unknown) & { amd?: unknown };
  if (w.requirejs || (typeof define === 'function' && define.amd)) out.push('requirejs');
  if (document.querySelector('script[type="module"]')) out.push('dynamic_import');
  return out;
}

function pfProbe(): MountProbe {
  // Custom elements with a shadow root are mount points too (web-component micro-frontends).
  const custom = [...document.querySelectorAll('*')].filter(
    (e) => e.tagName.includes('-') && e.shadowRoot !== null,
  );
  const seen = new Set<Element>();
  const mounts: MountPoint[] = [];
  for (const el of [...document.querySelectorAll(pfMountSelector()), ...custom]) {
    // A mount inside another mount point is part of it.
    if (seen.has(el) || [...seen].some((s) => s.contains(el))) continue;
    seen.add(el);
    mounts.push({ selector: pfDescribeMount(el), filled: pfFilled(el) });
  }
  const declared = new Set(
    [...document.querySelectorAll('script[src]')].map((s) => (s as HTMLScriptElement).src),
  );
  const bundles = performance
    .getEntriesByType('resource')
    .map((e) => e as PerformanceResourceTiming)
    .filter(
      (e) => (e.initiatorType === 'script' || /\.m?js(\?|$)/.test(e.name)) && !declared.has(e.name),
    )
    .map((e) => e.name);
  return { mounts, loaders: pfLoaders(), bundles: [...new Set(bundles)] };
}

/** Mount points, module loaders and dynamically loaded bundles of one document. */
export function probeMounts(target: Page | Frame): Promise<MountProbe> {
  return evalWithHelpers(
    target,
    [pfMountSelector, pfFilled, pfDescribeMount, pfLoaders, pfProbe],
    () => pfProbe(),
  );
}

/** Only a page that loads front ends at run time is worth waiting for (R4). */
export function shouldWaitForMounts(p: MountProbe): boolean {
  return p.loaders.length > 0 && p.mounts.some((m) => !m.filled);
}

/** One frame's mount probe at the end of the wait (spec 019 US3, LO-53). */
export interface FrameMountWait {
  url: string;
  probe: MountProbe;
  /** True when one of its mounts was still empty when the wait ran out. */
  timedOut: boolean;
}

export interface PageMountWait extends MountWait {
  frames: FrameMountWait[];
}

/** A frame's probe, or null when it went away or cannot be read (navigated, detached). */
async function probeOrNull(frame: Frame): Promise<MountProbe | null> {
  try {
    return await probeMounts(frame);
  } catch {
    return null;
  }
}

/** How long the mount wait goes on with nothing happening (spec 031 US1): above LO-53's 1.5 s. */
export const DEFAULT_MOUNT_QUIET_MS = 3_000;

export interface MountWaitLimits {
  /** Never longer than this (`scope.mfe_wait_ms` / `timeouts.mfe_wait_ms`). */
  hardMs: number;
  /**
   * Give up after this long without progress: no request to a new path, no change in the number
   * of elements of the page or its frames. A mount that is empty on purpose (a cookie banner after
   * consent) then costs this, not `hardMs` (spec 031 F-03).
   */
  quietMs?: number;
  /** Monotonic ms of the page's last request to a new path (`NetworkActivity.lastNewPathAt`). */
  lastNewPathAt?: () => number;
  pollMs?: number;
}

async function probeAll(
  page: Page,
  frames: () => Promise<readonly Frame[]>,
): Promise<{ top: MountProbe; inner: FrameMountWait[] }> {
  let top: MountProbe;
  try {
    top = await probeMounts(page);
  } catch {
    top = { mounts: [], loaders: [], bundles: [] }; // navigated: the next observation sees it
  }
  const inner: FrameMountWait[] = [];
  for (const f of await frames().catch(() => [] as readonly Frame[])) {
    const probe = await probeOrNull(f);
    if (probe) inner.push({ url: f.url(), probe, timedOut: shouldWaitForMounts(probe) });
  }
  return { top, inner };
}

/** Element counts of the page and its frames: growth anywhere is progress. */
async function shapeOf(page: Page, frames: () => Promise<readonly Frame[]>): Promise<string> {
  const count = (t: Page | Frame) =>
    t.evaluate(() => document.getElementsByTagName('*').length).catch(() => -1);
  const all = [page, ...(await frames().catch(() => [] as readonly Frame[]))];
  return (await Promise.all(all.map(count))).join(',');
}

/**
 * {@link waitForMounts} over the top document and the frames the observation reads (spec 019 US3,
 * LO-53): a legacy wrapper whose inner page mounts its own front end late was read empty, because
 * only the top document was probed (spec 015 T021 as built). One wait for all of them; the frame
 * list is asked again on every poll, so a frame that appears late is waited for too. The wait is
 * the shared condition wait (owner decision D-2 Q1): up to `hardMs`, ended early after `quietMs`
 * with no progress.
 */
export async function waitForMountsIn(
  page: Page,
  frames: () => Promise<readonly Frame[]>,
  limits: MountWaitLimits,
): Promise<PageMountWait> {
  let last = await probeAll(page, frames);
  const waiting = () => shouldWaitForMounts(last.top) || last.inner.some((f) => f.timedOut);
  const waited = await waitForCondition(
    async () => {
      if (page.isClosed()) return true;
      last = await probeAll(page, frames);
      return !waiting();
    },
    {
      lastNetworkActivityAt: limits.lastNewPathAt ?? (() => 0),
      fingerprint: () => shapeOf(page, frames),
    },
    {
      quietMs: Math.min(limits.quietMs ?? DEFAULT_MOUNT_QUIET_MS, limits.hardMs),
      hardMs: limits.hardMs,
      pollMs: limits.pollMs ?? 100,
    },
  );
  return {
    ...last.top,
    waitedMs: waited.waitedMs,
    timedOut: shouldWaitForMounts(last.top),
    frames: last.inner,
  };
}

/**
 * Wait, bounded by `maxMs` (portal `scope.mfe_wait_ms`), until every mount point of a page that loads
 * front ends at run time has content (spec 015 R4, LO-02): the shell may settle between fetching its
 * import map and fetching the bundle. A page without a loader, or with every mount filled, returns
 * at once. Never throws: a page that navigates away mid-wait ends the wait.
 */
export async function waitForMounts(
  target: Page | Frame,
  maxMs: number,
  pollMs = 100,
): Promise<MountWait> {
  const started = monotonicNow();
  let probe = await probeMounts(target);
  while (shouldWaitForMounts(probe) && monotonicNow() - started < maxMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    try {
      probe = await probeMounts(target);
    } catch {
      break; // navigated or detached: the next observation sees the new document
    }
  }
  return {
    ...probe,
    waitedMs: Math.round(monotonicNow() - started),
    timedOut: shouldWaitForMounts(probe),
  };
}
