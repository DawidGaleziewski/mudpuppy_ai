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

export interface RateLimiter {
  /** Resolves with a `release` function once a request may go out; rejects with RateLimiterHalted after `halt()`. */
  acquire(): Promise<() => void>;
  /** Permanently deny further permits (a block was detected — SC-007). Waiting acquirers are rejected. */
  halt(): void;
  readonly halted: boolean;
}

/**
 * Spacing limiter (a token bucket with burst 1): permits are at least 1000/requestsPerSecond ms
 * apart, and at most `maxConcurrency` are outstanding. Permits are issued in FIFO order.
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  if (!(opts.requestsPerSecond > 0)) throw new Error('requestsPerSecond must be > 0');
  if (!(opts.maxConcurrency >= 1)) throw new Error('maxConcurrency must be >= 1');
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const interval = 1000 / opts.requestsPerSecond;

  let halted = false;
  let inFlight = 0;
  let nextAt = 0;
  const waiters: { resolve: () => void; reject: (e: Error) => void }[] = [];

  const takeSlot = (): Promise<void> => {
    if (inFlight < opts.maxConcurrency) {
      inFlight += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => waiters.push({ resolve, reject }));
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
    halt() {
      halted = true;
      for (const w of waiters.splice(0)) w.reject(new RateLimiterHalted());
    },
    async acquire() {
      if (halted) throw new RateLimiterHalted();
      await takeSlot();
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
