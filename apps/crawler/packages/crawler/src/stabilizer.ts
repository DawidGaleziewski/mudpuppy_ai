/// <reference lib="dom" />
import type { Page } from 'playwright';

/** Tracks in-flight requests of a page so the stabilizer can wait for a network-idle window. */
export interface NetworkActivity {
  readonly inFlight: number;
  /** ms timestamp of the last request start or finish. */
  readonly lastActivityAt: number;
  dispose(): void;
}

export function trackNetworkActivity(page: Page, now: () => number = Date.now): NetworkActivity {
  let inFlight = 0;
  let last = now();
  const start = (): void => {
    inFlight += 1;
    last = now();
  };
  const end = (): void => {
    inFlight = Math.max(0, inFlight - 1);
    last = now();
  };
  page.on('request', start);
  page.on('requestfinished', end);
  page.on('requestfailed', end);
  return {
    get inFlight() {
      return inFlight;
    },
    get lastActivityAt() {
      return last;
    },
    dispose() {
      page.off('request', start);
      page.off('requestfinished', end);
      page.off('requestfailed', end);
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
  const networkIdleMs = opts.networkIdleMs ?? 500;
  const domQuietMs = opts.domQuietMs ?? 300;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const pollMs = opts.pollMs ?? 50;
  const deadline = Date.now() + timeoutMs;

  // Install a mutation clock once per document; it survives until the next navigation.
  const installClock = () =>
    page.evaluate(() => {
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
    page.evaluate(() => {
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
        return 'settled';
    } catch {
      // The document was replaced mid-check (navigation in flight); try again.
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return 'never_stabilized';
}
