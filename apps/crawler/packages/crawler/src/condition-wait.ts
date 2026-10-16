// One wait for slow pages (spec 030 FR-040, owner decision D-2 Q1): wait until a condition holds,
// for as long as the page keeps making progress, up to a hard limit. A fixed timeout cannot tell
// "slow but working" from "stuck": in the field an SSO login page loaded ~60 script files at the
// polite rate (~30 s) and a fixed 5 s wait reported the form missing (GC-08).

export interface ConditionWaitOptions {
  /** Give up after this long with no progress, ms. */
  quietMs: number;
  /** Never wait longer than this in total, ms. */
  hardMs: number;
  /** How often the condition and the progress signals are read, ms. Default 200. */
  pollMs?: number;
}

/** Signals that the page is still working: any change counts as progress. */
export interface ProgressSignals {
  /** ms timestamp of the last request start or finish (`NetworkActivity.lastActivityAt`). */
  lastNetworkActivityAt(): number;
  /** Something that changes when the page moves on: the URL, the DOM size. */
  fingerprint(): Promise<string>;
}

export type ConditionWaitOutcome =
  { met: true; waitedMs: number } | { met: false; waitedMs: number; why: 'quiet' | 'hard_limit' };

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/**
 * Poll `condition` until it is true. The quiet timer restarts whenever the network was active or
 * the page's fingerprint changed since the last poll, so a page that keeps loading gets up to
 * `hardMs`, and a dead one gives up after `quietMs`.
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  progress: ProgressSignals,
  opts: ConditionWaitOptions,
  clock: Clock = realClock,
): Promise<ConditionWaitOutcome> {
  const started = clock.now();
  const poll = opts.pollMs ?? 200;
  let lastProgress = started;
  let lastPrint = await progress.fingerprint();
  for (;;) {
    if (await condition()) return { met: true, waitedMs: clock.now() - started };
    const now = clock.now();
    if (now - started >= opts.hardMs)
      return { met: false, waitedMs: now - started, why: 'hard_limit' };
    const print = await progress.fingerprint();
    if (print !== lastPrint || progress.lastNetworkActivityAt() > lastProgress) {
      lastPrint = print;
      lastProgress = now;
    }
    if (now - lastProgress >= opts.quietMs)
      return { met: false, waitedMs: now - started, why: 'quiet' };
    await clock.sleep(poll);
  }
}
