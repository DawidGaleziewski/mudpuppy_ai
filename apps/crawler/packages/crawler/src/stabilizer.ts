/// <reference lib="dom" />
import type { Page, Request } from 'playwright';
import { waitForCondition } from './condition-wait.js';
import { evalInPage } from './in-page.js';

export interface InFlightRequest {
  url: string;
  resourceType: string;
  ageMs: number;
}

/** Tracks in-flight requests of a page so the stabilizer can wait for a network-idle window. */
export interface NetworkActivity {
  readonly inFlight: number;
  /** ms timestamp of the last request start or finish. */
  readonly lastActivityAt: number;
  /**
   * ms timestamp of the last request to a path the page had not asked for before (query ignored):
   * the page is still loading something new. A poll or a cache-busting beacon to a known path is
   * not progress (spec 031 US1, the shared wait).
   */
  readonly lastNewPathAt: number;
  /** Requests started and not yet finished or failed, oldest first (spec 005 diagnostics). */
  inFlightRequests(): InFlightRequest[];
  dispose(): void;
}

export interface NetworkActivityOptions {
  /** Observability hook; a hook that throws is ignored. */
  onRequestFailed?: (f: { url: string; resourceType: string; failure: string }) => void;
}

/** Long-lived streams stay open for the page's lifetime; counting them means never idle (spec 009 F-06). */
const STREAMS = new Set(['eventsource', 'websocket']);

/** Origin and path of a request URL, without query or fragment (the URL itself when unparsable). */
function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

export function trackNetworkActivity(
  page: Page,
  now: () => number = Date.now,
  opts: NetworkActivityOptions = {},
): NetworkActivity {
  let inFlight = 0;
  let last = now();
  let lastNewPath = last;
  const seenPaths = new Set<string>();
  const pending = new Map<Request, { url: string; resourceType: string; startedAt: number }>();
  const start = (r: Request): void => {
    if (STREAMS.has(r.resourceType())) return;
    inFlight += 1;
    last = now();
    const path = pathOf(r.url());
    if (!seenPaths.has(path)) {
      seenPaths.add(path);
      lastNewPath = last;
    }
    pending.set(r, { url: r.url(), resourceType: r.resourceType(), startedAt: last });
  };
  const end = (r: Request): void => {
    if (!pending.has(r)) return;
    inFlight = Math.max(0, inFlight - 1);
    last = now();
    pending.delete(r);
  };
  const failed = (r: Request): void => {
    end(r);
    if (!opts.onRequestFailed) return;
    try {
      opts.onRequestFailed({
        url: r.url(),
        resourceType: r.resourceType(),
        failure: r.failure()?.errorText ?? 'unknown',
      });
    } catch {
      // observers must never affect the tracker
    }
  };
  page.on('request', start);
  page.on('requestfinished', end);
  page.on('requestfailed', failed);
  return {
    get inFlight() {
      return inFlight;
    },
    get lastActivityAt() {
      return last;
    },
    get lastNewPathAt() {
      return lastNewPath;
    },
    inFlightRequests() {
      const t = now();
      return [...pending.values()].map((p) => ({
        url: p.url,
        resourceType: p.resourceType,
        ageMs: t - p.startedAt,
      }));
    },
    dispose() {
      page.off('request', start);
      page.off('requestfinished', end);
      page.off('requestfailed', failed);
    },
  };
}

export interface StabilizerOptions {
  /** Network must be quiet (no in-flight requests) for this long. Default 500. */
  networkIdleMs?: number;
  /** No DOM mutations for this long. Default 300. */
  domQuietMs?: number;
  /**
   * Give up after this long without progress (no request to a new path, no change in the URL or
   * the number of DOM nodes); yields `never_stabilized`. Default 10_000, today's limit.
   */
  timeoutMs?: number;
  /** Never wait longer than this, however much the page keeps loading. Default 30_000. */
  hardMs?: number;
  pollMs?: number;
}

export type StabilizationResult = 'settled' | 'never_stabilized';

/** What was still active when the hard timeout hit (spec 005 FR-005). */
export interface StabilizationDiagnostics {
  inFlight: InFlightRequest[];
  /** ms since the last DOM mutation; null when the document could not be read. */
  sinceMutationMs: number | null;
  runningAnimations: number | null;
  msSinceNetworkActivity: number;
}

export interface SettleOutcome {
  result: StabilizationResult;
  waitedMs: number;
  diagnostics?: StabilizationDiagnostics;
}

/**
 * Wait for stability instead of a fixed sleep (research §3): network idle window, DOM mutation quiet
 * period and no running finite CSS animations. A page that never settles is still observed and
 * recorded, flagged `never_stabilized`, never discarded. The wait is the shared condition wait
 * (owner decision D-2 Q1, spec 031 US1): it gives up after `timeoutMs` without progress, so a
 * stuck page costs what it did before, while a page still loading new parts gets up to `hardMs`.
 */
export async function settle(
  page: Page,
  net: NetworkActivity,
  opts: StabilizerOptions = {},
): Promise<StabilizationResult> {
  return (await settleWithDiagnostics(page, net, opts)).result;
}

/**
 * What changes when a page moves on: its URL and how many elements it has. Growth counts as
 * progress for the shared wait; a page mid-navigation reads as its own value.
 */
export async function pageShape(page: Page): Promise<string> {
  try {
    const nodes = await evalInPage(page, () => document.getElementsByTagName('*').length);
    return `${page.url()}#${String(nodes)}`;
  } catch {
    return `${page.url()}#navigating`;
  }
}

/** {@link settle}, plus how long it waited and, on timeout, what was still active. */
export async function settleWithDiagnostics(
  page: Page,
  net: NetworkActivity,
  opts: StabilizerOptions = {},
): Promise<SettleOutcome> {
  const networkIdleMs = opts.networkIdleMs ?? 500;
  const domQuietMs = opts.domQuietMs ?? 300;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const hardMs = Math.max(opts.hardMs ?? 30_000, timeoutMs);
  const pollMs = opts.pollMs ?? 50;

  // Install a mutation clock once per document; it survives until the next navigation.
  const installClock = () =>
    evalInPage(page, () => {
      const w = window as unknown as { __pfLastMutation?: number };
      if (w.__pfLastMutation === undefined) {
        w.__pfLastMutation = performance.now();
        new MutationObserver(() => {
          w.__pfLastMutation = performance.now();
        }).observe(document, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
      }
    });

  const domState = () =>
    evalInPage(page, () => {
      const w = window as unknown as { __pfLastMutation?: number };
      const running = document
        .getAnimations()
        .filter(
          (a) =>
            a.playState === 'running' &&
            Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity),
        ).length;
      return {
        sinceMutation: performance.now() - (w.__pfLastMutation ?? 0),
        runningAnimations: running,
      };
    });

  const stable = async (): Promise<boolean> => {
    try {
      await installClock();
      const dom = await domState();
      const netQuiet = net.inFlight === 0 && Date.now() - net.lastActivityAt >= networkIdleMs;
      return netQuiet && dom.sinceMutation >= domQuietMs && dom.runningAnimations === 0;
    } catch {
      return false; // The document was replaced mid-check (navigation in flight); try again.
    }
  };
  const waited = await waitForCondition(
    stable,
    { lastNetworkActivityAt: () => net.lastNewPathAt, fingerprint: () => pageShape(page) },
    { quietMs: timeoutMs, hardMs, pollMs },
  );
  if (waited.met) return { result: 'settled', waitedMs: waited.waitedMs };
  const dom = await domState().catch(() => null);
  return {
    result: 'never_stabilized',
    waitedMs: waited.waitedMs,
    diagnostics: {
      inFlight: net.inFlightRequests(),
      sinceMutationMs: dom ? Math.round(dom.sinceMutation) : null,
      runningAnimations: dom ? dom.runningAnimations : null,
      msSinceNetworkActivity: Date.now() - net.lastActivityAt,
    },
  };
}
