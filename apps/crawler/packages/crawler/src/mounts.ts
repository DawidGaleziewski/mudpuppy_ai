/// <reference lib="dom" />
import type { CompositionLoader } from '@pathfinder/core';
import type { Frame, Page } from 'playwright';
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
  const started = Date.now();
  let probe = await probeMounts(target);
  while (shouldWaitForMounts(probe) && Date.now() - started < maxMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    try {
      probe = await probeMounts(target);
    } catch {
      break; // navigated or detached: the next observation sees the new document
    }
  }
  return { ...probe, waitedMs: Date.now() - started, timedOut: shouldWaitForMounts(probe) };
}
