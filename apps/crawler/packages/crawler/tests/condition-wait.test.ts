import { describe, expect, it } from 'vitest';
import { waitForCondition, type Clock } from '../src/condition-wait.js';

/** A fake clock: `sleep` advances time instantly. */
function fakeClock(): Clock & { t: number } {
  const c = {
    t: 0,
    now: () => c.t,
    sleep: (ms: number) => {
      c.t += ms;
      return Promise.resolve();
    },
  };
  return c;
}

describe('waitForCondition (spec 030 FR-040)', () => {
  it('returns as soon as the condition holds', async () => {
    const clock = fakeClock();
    const r = await waitForCondition(
      () => Promise.resolve(clock.t >= 600),
      { lastNetworkActivityAt: () => 0, fingerprint: () => Promise.resolve('x') },
      { quietMs: 5000, hardMs: 60_000 },
      clock,
    );
    expect(r).toEqual({ met: true, waitedMs: 600 });
  });

  it('gives up after the quiet limit on a page that does nothing', async () => {
    const clock = fakeClock();
    const r = await waitForCondition(
      () => Promise.resolve(false),
      { lastNetworkActivityAt: () => 0, fingerprint: () => Promise.resolve('x') },
      { quietMs: 2000, hardMs: 60_000 },
      clock,
    );
    expect(r).toMatchObject({ met: false, why: 'quiet' });
    expect(r.waitedMs).toBe(2000);
  });

  it('keeps waiting past the quiet limit while the network is active, then meets the condition', async () => {
    const clock = fakeClock();
    // A slow SPA login: a request every second for 30 s, the form after that.
    const r = await waitForCondition(
      () => Promise.resolve(clock.t >= 30_000),
      { lastNetworkActivityAt: () => clock.t, fingerprint: () => Promise.resolve('x') },
      { quietMs: 2000, hardMs: 90_000 },
      clock,
    );
    expect(r).toEqual({ met: true, waitedMs: 30_000 });
  });

  it('counts a changing page as progress, and stops at the hard limit', async () => {
    const clock = fakeClock();
    const r = await waitForCondition(
      () => Promise.resolve(false),
      { lastNetworkActivityAt: () => 0, fingerprint: () => Promise.resolve(String(clock.t)) },
      { quietMs: 1000, hardMs: 10_000 },
      clock,
    );
    expect(r).toMatchObject({ met: false, why: 'hard_limit', waitedMs: 10_000 });
  });
});
