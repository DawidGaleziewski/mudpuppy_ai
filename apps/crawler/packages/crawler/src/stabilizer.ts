/// <reference lib="dom" />
import type { Page, Request } from 'playwright';
import { evalInPage } from './pw-eval.js';

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
  /** Requests started and not yet finished or failed, oldest first (spec 005 diagnostics). */
  inFlightRequests(): InFlightRequest[];
  dispose(): void;
}

export interface NetworkActivityOptions {
  /** Observability hook; a hook that throws is ignored. */
  onRequestFailed?: (f: { url: string; resourceType: string; failure: string }) => void;
}

export function trackNetworkActivity(
  page: Page,
  now: () => number = Date.now,
  opts: NetworkActivityOptions = {},
): NetworkActivity {
  let inFlight = 0;
  let last = now();
  const pending = new Map<Request, { url: string; resourceType: string; startedAt: number }>();
  const start = (r: Request): void => {
    inFlight += 1;
    last = now();
    pending.set(r, { url: r.url(), resourceType: r.resourceType(), startedAt: last });
  };
  const end = (r: Request): void => {
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
  /** Hard limit; exceeding it yields `never_stabilized`. Default 10_000. */
  timeoutMs?: number;
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
 * recorded, flagged `never_stabilized`, never discarded.
 */
export async function settle(
  page: Page,
  net: NetworkActivity,
  opts: StabilizerOptions = {},
): Promise<StabilizationResult> {
  return (await settleWithDiagnostics(page, net, opts)).result;
}

/** {@link settle}, plus how long it waited and, on timeout, what was still active. */
export async function settleWithDiagnostics(
  page: Page,
  net: NetworkActivity,
  opts: StabilizerOptions = {},
): Promise<SettleOutcome> {
  const started = Date.now();
  const networkIdleMs = opts.networkIdleMs ?? 500;
  const domQuietMs = opts.domQuietMs ?? 300;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const pollMs = opts.pollMs ?? 50;
  const deadline = Date.now() + timeoutMs;

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

  while (Date.now() < deadline) {
    try {
      await installClock();
      const dom = await domState();
      const netQuiet = net.inFlight === 0 && Date.now() - net.lastActivityAt >= networkIdleMs;
      if (netQuiet && dom.sinceMutation >= domQuietMs && dom.runningAnimations === 0)
        return { result: 'settled', waitedMs: Date.now() - started };
    } catch {
      // The document was replaced mid-check (navigation in flight); try again.
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  const dom = await domState().catch(() => null);
  return {
    result: 'never_stabilized',
    waitedMs: Date.now() - started,
    diagnostics: {
      inFlight: net.inFlightRequests(),
      sinceMutationMs: dom ? Math.round(dom.sinceMutation) : null,
      runningAnimations: dom ? dom.runningAnimations : null,
      msSinceNetworkActivity: Date.now() - net.lastActivityAt,
    },
  };
}
