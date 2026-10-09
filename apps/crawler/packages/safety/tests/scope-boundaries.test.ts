import { describe, expect, it } from 'vitest';
import type { Scope } from '@pathfinder/config';
import {
  checkBudgets,
  checkScope,
  domainAllowed,
  FocusError,
  focusScope,
  matchesGlob,
  narrowScope,
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
};
const scope: Scope = {
  ...budgets,
  allowed_domains: ['example.test'],
  allowed_paths: ['/shop/*', '/about'],
  external_link_policy: 'record',
};

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
          rule: 'scope:path',
          reason: '/admin matches no allowed_paths entry',
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

  it('an excluded path is refused after the allowed paths', () => {
    expect(
      checkScope('https://example.test/shop/cart', { ...scope, excluded_paths: ['/shop/cart*'] }),
    ).toEqual({
      inScope: false,
      external: false,
      refusal: {
        status: 'out_of_scope',
        rule: 'scope:excluded_path',
        reason: '/shop/cart is excluded for this scan (/shop/cart*)',
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
  const portal: Scope = { ...scope, allowed_domains: ['example.test', 'other.test'] };

  it('keeps the portal values when the persona restricts nothing', () => {
    expect(narrowScope(portal, {})).toEqual(portal);
  });

  it('keeps only portal domains within the persona list', () => {
    expect(narrowScope(portal, { allowed_domains: ['example.test'] }).allowed_domains).toEqual([
      'example.test',
    ]);
  });

  it('keeps persona paths a portal path covers once trailing stars are dropped', () => {
    const p = { ...portal, allowed_paths: ['/about', '/a*/b'] };
    expect(
      narrowScope(p, { allowed_paths: ['/about**', '/a*/b*', '/admin*'] }).allowed_paths,
    ).toEqual(['/about**', '/a*/b*']);
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

  it('names the paths outside the portal in its error', () => {
    expect(() => focusScope(scope, { only_paths: ['/admin/*'] }, base)).toThrow(
      new FocusError("path /admin/* not within the portal's /shop/*, /about"),
    );
  });

  it('accepts a focus path covered by any portal path once trailing stars are dropped', () => {
    const s = focusScope(
      scope,
      { only_paths: ['/about**'], start_url: 'https://example.test/about' },
      base,
    );
    expect(s.allowed_paths).toEqual(['/about**']);
    const t = focusScope(
      { ...scope, allowed_paths: ['/x', '/a*/b'] },
      { only_paths: ['/a*/b*'], start_url: 'https://example.test/a1/b' },
      base,
    );
    expect(t.allowed_paths).toEqual(['/a*/b*']);
  });

  it('narrows the domains to the focus and keeps the exclusions of both', () => {
    const s = focusScope(
      { ...scope, excluded_paths: ['/shop/old*'] },
      {
        only_domains: ['shop.example.test'],
        exclude_paths: ['/shop/cart*'],
        start_url: 'https://shop.example.test/shop/',
      },
      base,
    );
    expect(s.allowed_domains).toEqual(['shop.example.test']);
    expect(s.excluded_paths).toEqual(['/shop/old*', '/shop/cart*']);
  });

  it('refuses a start page outside the focused scope', () => {
    expect(() =>
      focusScope(scope, { exclude_paths: ['/shop/*'] }, 'https://example.test/shop/x'),
    ).toThrow(
      new FocusError(
        'the start page https://example.test/shop/x is outside the focus: /shop/x is excluded for this scan (/shop/*)',
      ),
    );
  });
});
