import { describe, expect, it } from 'vitest';
import { builtinRuleSet } from '@mudpuppy/safety';
import { decide, type GateContext } from '../src/action-gate.js';
import type { RobotsCheck } from '../src/robots-registry.js';

/** A robots stub: refuses URLs containing `cHash` or under `/quote/`, `unknown` for other hosts. */
const robots = {
  check(url: string): RobotsCheck {
    if (!url.startsWith('https://marketsite.example')) return { state: 'unknown' };
    if (url.includes('cHash'))
      return { state: 'refused', rule: 'robots:Disallow: *cHash*', policyId: 'p1' };
    if (url.includes('/quote/'))
      return { state: 'refused', rule: 'robots:Disallow: /quote/', policyId: 'p1' };
    return { state: 'allowed', rule: null };
  },
};

const ctx = (over: Partial<GateContext> = {}): GateContext => ({
  scope: {
    allowed_domains: ['marketsite.example'],
    url_lists: [{ where: 'urls', lists: { disallowed: ['/oferty/wystaw/*'] } }],
    external_link_policy: 'record',
    max_depth: 6,
    max_states: 500,
    max_actions_per_state: 20,
    max_run_time_minutes: 60,
    max_steps: 2000,
    mfe_wait_ms: 10000,
    frame_depth: 3,
    client_redirect_wait_ms: 5000,
  },
  denylist: ['logout', 'payment', 'bidding', 'buy_now'],
  rules: builtinRuleSet(),
  robots,
  effectiveMaxActionClass: 'read',
  usage: { depth: 1, states: 0, actionsInState: 0, elapsedMs: 0, steps: 0 },
  ...over,
});
const here = 'https://marketsite.example/oferty';

describe('action gate', () => {
  it('allows an in-scope read link', () => {
    const r = decide(
      {
        kind: 'act',
        currentUrl: here,
        descriptor: { role: 'link', name: 'Moda', href: '/oferty/moda' },
      },
      ctx(),
    );
    expect(r).toMatchObject({ allowed: true });
  });

  it('clicks a javascript: postback link instead of refusing it as a URL (spec 015)', () => {
    const r = decide(
      {
        kind: 'act',
        currentUrl: here,
        descriptor: { role: 'link', name: 'Lista operacji', href: "javascript:go('lista')" },
      },
      ctx(),
    );
    expect(r).toMatchObject({ allowed: true });
  });

  it('a javascript: link with a mutating label is still held by the ceiling', () => {
    const r = decide(
      {
        kind: 'act',
        currentUrl: here,
        descriptor: { role: 'link', name: 'Dodaj do ulubionych', href: 'javascript:void(0)' },
      },
      ctx(),
    );
    expect(r).toMatchObject({ allowed: false, status: 'skipped_unsafe' });
  });

  it('refuses a denylisted button as denylisted, naming the rule', () => {
    const r = decide(
      { kind: 'act', currentUrl: here, descriptor: { role: 'button', name: 'Kup teraz' } },
      ctx(),
    );
    expect(r).toMatchObject({ allowed: false, status: 'denylisted', rule: 'bidding→purchase' });
  });

  it('refuses a mutating action above the ceiling as skipped_unsafe', () => {
    const r = decide(
      {
        kind: 'act',
        currentUrl: here,
        descriptor: { role: 'button', name: 'Dodaj do ulubionych' },
      },
      ctx(),
    );
    expect(r).toMatchObject({ allowed: false, status: 'skipped_unsafe', rule: 'ceiling:read' });
  });

  it('allows the same action when the effective ceiling permits it', () => {
    const r = decide(
      {
        kind: 'act',
        currentUrl: here,
        descriptor: { role: 'button', name: 'Dodaj do ulubionych' },
      },
      ctx({ effectiveMaxActionClass: 'mutating' }),
    );
    expect(r.allowed).toBe(true);
  });

  it('refuses out-of-scope hrefs before anything else', () => {
    const r = decide(
      {
        kind: 'act',
        currentUrl: here,
        descriptor: { role: 'link', name: 'Sponsor', href: 'https://ads.example/x' },
      },
      ctx(),
    );
    expect(r).toMatchObject({ allowed: false, status: 'out_of_scope', rule: 'scope:domain' });
  });

  it('refuses navigate to a logout URL and to a denylisted path', () => {
    expect(
      decide({ kind: 'navigate', url: 'https://marketsite.example/wyloguj' }, ctx()),
    ).toMatchObject({ allowed: false, status: 'denylisted', rule: 'logout' });
    expect(
      decide({ kind: 'navigate', url: 'https://marketsite.example/oferty/wystaw/nowa' }, ctx()),
    ).toMatchObject({
      allowed: false,
      status: 'out_of_scope',
      rule: 'urls.disallowed /oferty/wystaw/*',
    });
  });

  it('refuses a dangerous URL that is not denylisted by the ceiling', () => {
    const r = decide(
      { kind: 'navigate', url: 'https://marketsite.example/konto/oferty/1/usun' },
      ctx(),
    );
    expect(r).toMatchObject({ allowed: false, status: 'skipped_unsafe' });
  });

  it('refuses when a budget is exhausted, after the other checks pass', () => {
    const r = decide(
      { kind: 'navigate', url: 'https://marketsite.example/oferty/laptopy' },
      ctx({ usage: { depth: 1, states: 0, actionsInState: 0, elapsedMs: 0, steps: 2000 } }),
    );
    expect(r).toMatchObject({ allowed: false, status: 'budget_reached', rule: 'budget:max_steps' });
  });

  it('a claimed read class cannot get a bid button past the gate', () => {
    const r = decide(
      {
        kind: 'act',
        currentUrl: here,
        descriptor: { role: 'button', name: 'Licytuj', claimedClass: 'read' },
      },
      ctx({ denylist: [] }),
    );
    expect(r).toMatchObject({ allowed: false, status: 'skipped_unsafe' });
  });

  it('returns the classification so callers can record it', () => {
    const r = decide({ kind: 'navigate', url: 'https://marketsite.example/oferty' }, ctx());
    expect(r.classification.safetyClass).toBe('read');
  });

  it('refuses a robots-disallowed link as robots_disallowed with the robots rule (FR-003)', () => {
    const r = decide(
      {
        kind: 'act',
        currentUrl: here,
        descriptor: {
          role: 'link',
          name: 'Formularze',
          href: '/oferty/?itm_campaign=x&cHash=02e3',
        },
      },
      ctx(),
    );
    expect(r).toMatchObject({
      allowed: false,
      status: 'robots_disallowed',
      rule: 'robots:Disallow: *cHash*',
      policyId: 'p1',
    });
  });

  it('treats a direct navigate URL exactly like a link (US1 scenario 7)', () => {
    const r = decide({ kind: 'navigate', url: 'https://marketsite.example/oferty/quote/x' }, ctx());
    expect(r).toMatchObject({
      allowed: false,
      status: 'robots_disallowed',
      rule: 'robots:Disallow: /quote/',
    });
  });

  it('checks robots after scope and before the denylist', () => {
    const outOfScope = decide(
      { kind: 'navigate', url: 'https://marketsite.example/quote/x' },
      ctx({
        scope: {
          ...ctx().scope,
          url_lists: [{ where: 'urls', lists: { allowed: ['/oferty/*'] } }],
        },
      }),
    );
    expect(outOfScope).toMatchObject({ status: 'out_of_scope', rule: 'urls.allowed' });
    const both = decide(
      { kind: 'navigate', url: 'https://marketsite.example/oferty/quote/logout' },
      ctx({ denylist: ['logout'] }),
    );
    expect(both).toMatchObject({ status: 'robots_disallowed' });
  });

  it('lets an unknown robots verdict through to the later checks (the request gate decides)', () => {
    const r = decide({ kind: 'navigate', url: 'https://m.marketsite.example/oferty' }, ctx());
    expect(r).toMatchObject({ allowed: true });
  });
});
