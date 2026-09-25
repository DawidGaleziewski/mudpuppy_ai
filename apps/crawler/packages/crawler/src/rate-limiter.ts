export class RateLimiterHalted extends Error {
  constructor() {
    super('rate limiter halted: no further requests are permitted');
    this.name = 'RateLimiterHalted';
  }
}

export interface RateLimiterOptions {
  requestsPerSecond: number;
  maxConcurrency: number;
  /** Injectable for tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface AcquireOptions {
  /**
   * Wait for a slot ahead of every non-priority waiter (FIFO among priority waiters). Pacing is
   * unchanged. For main-frame navigations, which would otherwise queue behind every pending
   * subresource of the page being left.
   */
  priority?: boolean;
}

export interface RateLimiter {
  /** Resolves with a `release` function once a request may go out; rejects with RateLimiterHalted after `halt()`. */
  acquire(opts?: AcquireOptions): Promise<() => void>;
  /** Permanently deny further permits (a block was detected — SC-007). Waiting acquirers are rejected. */
  halt(): void;
  readonly halted: boolean;
  /** Lower the rate (robots `Crawl-delay`, FR-007); a faster value is ignored. */
  slowTo(requestsPerSecond: number): void;
  readonly requestsPerSecond: number;
}

/**
 * Spacing limiter (a token bucket with burst 1): permits are at least 1000/requestsPerSecond ms
 * apart, and at most `maxConcurrency` are outstanding. Slots are handed out in FIFO order, priority
 * acquirers first.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  if (!(opts.requestsPerSecond > 0)) throw new Error('requestsPerSecond must be > 0');
  if (!(opts.maxConcurrency >= 1)) throw new Error('maxConcurrency must be >= 1');
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let rps = opts.requestsPerSecond;
  let interval = 1000 / rps;

  let halted = false;
  let inFlight = 0;
  let nextAt = 0;
  const waiters: { resolve: () => void; reject: (e: Error) => void; priority: boolean }[] = [];

  const takeSlot = (priority: boolean): Promise<void> => {
    if (inFlight < opts.maxConcurrency) {
      inFlight += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const w = { resolve, reject, priority };
      const at = priority ? waiters.findIndex((x) => !x.priority) : -1;
      if (at === -1) waiters.push(w);
      else waiters.splice(at, 0, w);
    });
  };

  const release = (): void => {
    const next = waiters.shift();
    if (next)
      next.resolve(); // hand the slot straight to the next waiter
    else inFlight -= 1;
  };

  // Serialises the pacing so concurrent acquirers get consecutive time slots.
  let chain: Promise<unknown> = Promise.resolve();

  return {
    get halted() {
      return halted;
    },
    get requestsPerSecond() {
      return rps;
    },
    slowTo(next: number) {
      if (next > 0 && next < rps) {
        const slower = 1000 / next;
        if (nextAt > 0) nextAt += slower - interval; // the slot already booked moves back too
        rps = next;
        interval = slower;
      }
    },
    halt() {
      halted = true;
      for (const w of waiters.splice(0)) w.reject(new RateLimiterHalted());
    },
    async acquire(acquireOpts: AcquireOptions = {}) {
      if (halted) throw new RateLimiterHalted();
      await takeSlot(acquireOpts.priority ?? false);
      const paced = chain.then(async () => {
        if (halted) throw new RateLimiterHalted();
        const wait = nextAt - now();
        if (wait > 0) await sleep(wait);
        if (halted) throw new RateLimiterHalted();
        nextAt = Math.max(now(), nextAt) + interval;
      });
      chain = paced.catch(() => undefined);
      try {
        await paced;
      } catch (e) {
        release();
        throw e;
      }
      let released = false;
      return () => {
        if (!released) {
          released = true;
          release();
        }
      };
    },
  };
}
