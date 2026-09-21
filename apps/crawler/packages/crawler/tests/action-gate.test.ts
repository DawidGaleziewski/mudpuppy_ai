import { describe, expect, it } from 'vitest';
import { decide, type GateContext } from '../src/action-gate.js';

const ctx = (over: Partial<GateContext> = {}): GateContext => ({
  scope: {
    allowed_domains: ['marketsite.example'],
    allowed_paths: ['/*'],
    external_link_policy: 'record',
    max_depth: 6,
    max_states: 500,
    max_actions_per_state: 20,
    max_run_time_minutes: 60,
    max_steps: 2000,
  },
  denylist: ['logout', 'payment', 'bidding', 'buy_now', 'path:/oferty/wystaw/*'],
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

  it('refuses a denylisted button as denylisted, naming the rule', () => {
    const r = decide(
      { kind: 'act', currentUrl: here, descriptor: { role: 'button', name: 'Kup teraz' } },
      ctx(),
    );
    expect(r).toMatchObject({ allowed: false, status: 'denylisted', rule: 'buy_now' });
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
    ).toMatchObject({ allowed: false, rule: 'path:/oferty/wystaw/*' });
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
});
