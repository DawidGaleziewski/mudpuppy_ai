import { describe, expect, it } from 'vitest';
import type { Scope } from '@mudpuppy/config';
import {
  checkBudgets,
  checkScope,
  domainAllowed,
  FocusError,
  focusScope,
  matchesGlob,
  narrowScope,
  type RunScope,
} from '../src/scope.js';

/**
 * Boundary cases for the scope gate (spec 012 F-12): the URL just inside and just outside each
 * rule, look-alike domains, exact refusal texts, and the narrowing rules of persona and focus.
 * A weak test here would let the crawler open a page it must not.
 */

const budgets = {
  max_depth: 3,
  max_states: 10,
  max_actions_per_state: 5,
  max_run_time_minutes: 5,
  max_steps: 20,
  mfe_wait_ms: 10000,
  frame_depth: 3,
  client_redirect_wait_ms: 5000,
};
const portalUrls = { allowed: ['/shop/*', '/about'] };
const baseScope: Scope = {
  ...budgets,
  allowed_domains: ['example.test'],
  external_link_policy: 'record',
};
const scope: RunScope = narrowScope(baseScope, {}, {}, portalUrls);

describe('matchesGlob', () => {
  it('is anchored at both ends and case-insensitive', () => {
    expect(matchesGlob('/Shop/*', '/shop/x')).toBe(true);
    expect(matchesGlob('/about', '/about/more')).toBe(false);
    expect(matchesGlob('/about', '/x/about')).toBe(false);
  });

  it('treats regex characters in a glob literally', () => {
    expect(matchesGlob('/a.b', '/aXb')).toBe(false);
    expect(matchesGlob('/a.b', '/a.b')).toBe(true);
  });
});

describe('domainAllowed', () => {
  it.each([
    ['example.test', true],
    ['shop.example.test', true],
    ['WWW.Example.TEST', true],
    ['evilexample.test', false],
    ['example.test.evil.test', false],
    ['example.tes', false],
  ])('%s → %s', (host, allowed) => {
    expect(domainAllowed(host, ['other.test', 'example.test'])).toBe(allowed);
  });
});

describe('checkScope verdicts', () => {
  it.each([
    [
      'not a url',
      {
        inScope: false,
        external: false,
        refusal: {
          status: 'out_of_scope',
          rule: 'scope:url',
          reason: 'not an absolute URL: not a url',
        },
      },
    ],
    [
      'ftp://example.test/shop/x',
      {
        inScope: false,
        external: false,
        refusal: {
          status: 'out_of_scope',
          rule: 'scope:protocol',
          reason: 'protocol ftp: is never followed',
        },
      },
    ],
    [
      'https://ads.test/shop/x',
      {
        inScope: false,
        external: true,
        refusal: {
          status: 'out_of_scope',
          rule: 'scope:domain',
          reason: 'ads.test is outside allowed_domains; external links are recorded, not followed',
        },
      },
    ],
    [
      'https://example.test/admin',
      {
        inScope: false,
        external: false,
        refusal: {
          status: 'out_of_scope',
          rule: 'urls.allowed',
          reason: 'matches no urls.allowed entry',
        },
      },
    ],
    ['http://example.test/shop/x', { inScope: true, external: false }],
    ['https://sub.example.test/about', { inScope: true, external: false }],
  ])('%s', (url, verdict) => {
    expect(checkScope(url, scope)).toEqual(verdict);
  });

  it('follow lets an external link through, still marked external', () => {
    expect(checkScope('https://ads.test/x', { ...scope, external_link_policy: 'follow' })).toEqual({
      inScope: true,
      external: true,
    });
  });

  it('a disallowed entry wins over the allowed list', () => {
    const s = narrowScope(baseScope, {}, {}, { ...portalUrls, disallowed: ['/shop/cart*'] });
    expect(checkScope('https://example.test/shop/cart', s)).toEqual({
      inScope: false,
      external: false,
      refusal: {
        status: 'out_of_scope',
        rule: 'urls.disallowed /shop/cart*',
        reason: 'excluded by rule /shop/cart*',
      },
    });
  });
});

describe('checkBudgets', () => {
  const usage = { depth: 3, states: 9, actionsInState: 4, elapsedMs: 4 * 60_000, steps: 19 };

  it('allows usage exactly at max_depth and just under every other cap', () => {
    expect(checkBudgets(usage, budgets)).toBeNull();
  });

  it.each([
    [{ depth: 4 }, 'budget:max_depth', 'depth 4 exceeds 3'],
    [{ states: 10 }, 'budget:max_states', '10 states recorded, cap is 10'],
    [
      { actionsInState: 5 },
      'budget:max_actions_per_state',
      '5 actions taken in this state, cap is 5',
    ],
    [{ elapsedMs: 5 * 60_000 }, 'budget:max_run_time_minutes', 'run time reached 5 minutes'],
    [{ steps: 20 }, 'budget:max_steps', '20 steps taken, cap is 20'],
  ])('%j → %s', (over, rule, reason) => {
    expect(checkBudgets({ ...usage, ...over }, budgets)).toEqual({
      status: 'budget_reached',
      rule,
      reason,
    });
  });
});

describe('narrowScope', () => {
  const portal: Scope = { ...baseScope, allowed_domains: ['example.test', 'other.test'] };

  it('keeps the portal values when the persona restricts nothing', () => {
    expect(narrowScope(portal, {}, {}, portalUrls)).toEqual({
      ...portal,
      url_lists: [{ where: 'urls', lists: portalUrls }],
    });
  });

  it('keeps only portal domains within the persona list', () => {
    expect(narrowScope(portal, { allowed_domains: ['example.test'] }).allowed_domains).toEqual([
      'example.test',
    ]);
  });

  it('adds the persona lists after the portal lists: a URL must pass both', () => {
    const n = narrowScope(
      portal,
      { urls: { allowed: ['/about', '/admin*'], disallowed: [] } },
      {},
      portalUrls,
    );
    expect(n.url_lists).toEqual([
      { where: 'urls', lists: portalUrls },
      { where: 'persona.urls', lists: { allowed: ['/about', '/admin*'], disallowed: [] } },
    ]);
    expect(checkScope('https://example.test/about', n).inScope).toBe(true);
    // in the persona list, not the portal's: the portal's wins (never widens)
    expect(checkScope('https://example.test/admin', n).refusal?.rule).toBe('urls.allowed');
    // in the portal list, not the persona's
    expect(checkScope('https://example.test/shop/x', n).refusal?.rule).toBe('persona.urls.allowed');
  });

  it.each([
    ['record', 'follow', 'record'],
    ['follow', 'record', 'record'],
    ['follow', 'follow', 'follow'],
    ['follow', undefined, 'follow'],
    ['record', undefined, 'record'],
  ] as const)('portal %s + persona %s → %s', (p, r, expected) => {
    const n = narrowScope(
      { ...portal, external_link_policy: p },
      r ? { external_link_policy: r } : {},
      {},
      portalUrls,
    );
    expect(n.external_link_policy).toBe(expected);
  });
});

describe('focusScope', () => {
  const base = 'https://example.test/shop/';

  it('names the domains outside the portal in its error', () => {
    expect(() => focusScope(scope, { only_domains: ['example.test', 'evil.test'] }, base)).toThrow(
      new FocusError("address evil.test not within the portal's example.test"),
    );
  });

  it('does not require a focus path to be covered by a portal path: the lists intersect instead', () => {
    const s = focusScope(
      scope,
      { only_paths: ['/shop/a*'], start_url: 'https://example.test/shop/abc' },
      base,
    );
    expect(s.url_lists.map((l) => l.where)).toEqual(['urls', 'focus']);
    expect(checkScope('https://example.test/shop/abc', s).inScope).toBe(true);
    expect(checkScope('https://example.test/shop/xyz', s).refusal?.rule).toBe('focus.allowed');
    // a focus entry the portal list does not cover opens nothing the portal refuses
    const t = focusScope(
      scope,
      { only_paths: ['/admin/*', '/shop/*'], start_url: 'https://example.test/shop/x' },
      base,
    );
    expect(checkScope('https://example.test/admin/x', t).refusal?.rule).toBe('urls.allowed');
  });

  it('refuses an unusable focus entry, naming it', () => {
    expect(() => focusScope(scope, { only_paths: ['admin/*'] }, base)).toThrow(
      new FocusError('"admin/*" must be a path ("/…"), an absolute URL ("https://…") or a /regex/'),
    );
  });

  it('narrows the domains to the focus and keeps the exclusions of both', () => {
    const portalScope = narrowScope(
      baseScope,
      {},
      {},
      { ...portalUrls, disallowed: ['/shop/old*'] },
    );
    const s = focusScope(
      portalScope,
      {
        only_domains: ['shop.example.test'],
        exclude_paths: ['/shop/cart*'],
        start_url: 'https://shop.example.test/shop/',
      },
      base,
    );
    expect(s.allowed_domains).toEqual(['shop.example.test']);
    expect(checkScope('https://shop.example.test/shop/old1', s).refusal?.rule).toBe(
      'urls.disallowed /shop/old*',
    );
    expect(checkScope('https://shop.example.test/shop/cart', s).refusal?.rule).toBe(
      'focus.disallowed /shop/cart*',
    );
  });

  it('refuses a start page outside the focused scope', () => {
    expect(() =>
      focusScope(scope, { exclude_paths: ['/shop/*'] }, 'https://example.test/shop/x'),
    ).toThrow(
      new FocusError(
        'the start page https://example.test/shop/x is outside the focus: excluded by rule /shop/*',
      ),
    );
  });
});
