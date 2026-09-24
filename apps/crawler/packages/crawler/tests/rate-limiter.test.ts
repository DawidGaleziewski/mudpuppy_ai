import { describe, expect, it, vi } from 'vitest';
import { RateLimiterHalted, createRateLimiter } from '../src/rate-limiter.js';

/** Virtual clock: sleeping just advances time. */
function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => void (t += ms),
    advance: (ms: number) => void (t += ms),
  };
}

describe('rate limiter', () => {
  it('honours requests_per_second by spacing permits', async () => {
    const c = clock();
    const l = createRateLimiter({ requestsPerSecond: 2, maxConcurrency: 10, ...c });
    const times: number[] = [];
    for (let i = 0; i < 4; i++) {
      const release = await l.acquire();
      times.push(c.now());
      release();
    }
    expect(times).toEqual([0, 500, 1000, 1500]);
  });

  it('spaces concurrent acquirers as well', async () => {
    vi.useFakeTimers({ now: 0 });
    try {
      const l = createRateLimiter({ requestsPerSecond: 1, maxConcurrency: 10 });
      const stamps: number[] = [];
      const all = Promise.all(
        [0, 1, 2].map(async () => {
          const r = await l.acquire();
          stamps.push(Date.now());
          r();
        }),
      );
      await vi.advanceTimersByTimeAsync(3000);
      await all;
      expect(stamps).toEqual([0, 1000, 2000]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('honours max_concurrency', async () => {
    const c = clock();
    const l = createRateLimiter({ requestsPerSecond: 1000, maxConcurrency: 2, ...c });
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        const release = await l.acquire();
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 1));
        active -= 1;
        release();
      }),
    );
    expect(peak).toBe(2);
  });

  it('issues no further permits once halted, including to waiters', async () => {
    const c = clock();
    const l = createRateLimiter({ requestsPerSecond: 1, maxConcurrency: 1, ...c });
    const first = await l.acquire();
    const waiting = l.acquire();
    l.halt();
    await expect(waiting).rejects.toBeInstanceOf(RateLimiterHalted);
    first();
    await expect(l.acquire()).rejects.toBeInstanceOf(RateLimiterHalted);
    await expect(l.acquire()).rejects.toBeInstanceOf(RateLimiterHalted);
    expect(l.halted).toBe(true);
  });

  it('release is idempotent', async () => {
    const c = clock();
    const l = createRateLimiter({ requestsPerSecond: 1000, maxConcurrency: 1, ...c });
    const r = await l.acquire();
    r();
    r();
    const r2 = await l.acquire();
    let got = false;
    const p = l.acquire().then((x) => ((got = true), x));
    await new Promise((res) => setTimeout(res, 5));
    expect(got).toBe(false); // still only one slot despite the double release
    r2();
    (await p)();
  });

  it('rejects invalid configuration', () => {
    expect(() => createRateLimiter({ requestsPerSecond: 0, maxConcurrency: 1 })).toThrow();
    expect(() => createRateLimiter({ requestsPerSecond: 1, maxConcurrency: 0 })).toThrow();
  });

  it('slowTo lowers the rate and never raises it (FR-007)', async () => {
    const c = clock();
    const l = createRateLimiter({ requestsPerSecond: 2, maxConcurrency: 10, ...c });
    const times: number[] = [];
    const take = async () => {
      const r = await l.acquire();
      times.push(c.now());
      r();
    };
    await take(); // 0
    l.slowTo(1); // 1000 ms spacing from now on
    await take();
    l.slowTo(10); // faster: ignored
    await take();
    expect(times).toEqual([0, 1000, 2000]);
    expect(l.requestsPerSecond).toBe(1);
  });
});
