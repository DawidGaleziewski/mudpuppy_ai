import { Timeouts } from '@pathfinder/config';
import { describe, expect, it } from 'vitest';
import { DEFAULT_NAVIGATION_MS, DEFAULT_SETTLE_MS, pageTimeouts } from '../src/timeouts.js';

const scope = { mfe_wait_ms: 10_000, client_redirect_wait_ms: 5_000 };

describe('pageTimeouts (spec 023 US4)', () => {
  it('without timeouts: the defaults and the scope values', () => {
    expect(pageTimeouts(undefined, scope, 'https://x.pl/')).toEqual({
      settle_ms: DEFAULT_SETTLE_MS,
      settle_hard_ms: 30_000,
      navigation_ms: DEFAULT_NAVIGATION_MS,
      mfe_wait_ms: 10_000,
      mfe_quiet_ms: 3_000,
      client_redirect_wait_ms: 5_000,
      matched: null,
    });
  });

  it('the shared-wait limits come from the portal and per URL too (spec 031 US1)', () => {
    const t = Timeouts.parse({
      settle_hard_ms: 60_000,
      per_url: [{ match: '/legacy/*', mfe_quiet_ms: 8_000 }],
    });
    expect(pageTimeouts(t, scope, 'https://x.pl/legacy/a.do')).toMatchObject({
      settle_hard_ms: 60_000,
      mfe_quiet_ms: 8_000,
    });
  });

  it('the first matching per-URL entry wins over the portal values', () => {
    const t = Timeouts.parse({
      settle_ms: 8_000,
      per_url: [
        { match: '/kalkulator/*', settle_ms: 15_000 },
        { match: '/kalkulator/oc', settle_ms: 20_000, navigation_ms: 60_000 },
      ],
    });
    expect(pageTimeouts(t, scope, 'https://x.pl/kalkulator/oc')).toMatchObject({
      settle_ms: 15_000,
      navigation_ms: DEFAULT_NAVIGATION_MS,
      matched: '/kalkulator/*',
    });
    expect(pageTimeouts(t, scope, 'https://x.pl/faq')).toMatchObject({
      settle_ms: 8_000,
      matched: null,
    });
  });

  it('refuses a value outside the bounds', () => {
    expect(() => Timeouts.parse({ settle_ms: 10 })).toThrow();
  });
});
