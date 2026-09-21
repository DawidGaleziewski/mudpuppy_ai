import { describe, expect, it } from 'vitest';
import {
  checkBudgets,
  checkDenylist,
  checkScope,
  classifyAction,
  classifyUrl,
  narrowScope,
} from '../src/index.js';

const scope = {
  allowed_domains: ['marketsite.example'],
  allowed_paths: ['/oferty/*', '/oferta/*', '/'],
  external_link_policy: 'record' as const,
  max_depth: 3,
  max_states: 10,
  max_actions_per_state: 5,
  max_run_time_minutes: 10,
  max_steps: 100,
};

describe('checkScope', () => {
  it('allows in-domain, in-path URLs and subdomains', () => {
    expect(checkScope('https://marketsite.example/oferty/laptopy', scope).inScope).toBe(true);
    expect(checkScope('https://www.marketsite.example/oferta/1', scope).inScope).toBe(true);
  });

  it('refuses out-of-domain URLs under policy record: recorded, not followed', () => {
    const v = checkScope('https://evil.example/oferty/x', scope);
    expect(v).toMatchObject({ inScope: false, external: true });
    expect(v.refusal).toMatchObject({ status: 'out_of_scope', rule: 'scope:domain' });
  });

  it('does not let a look-alike domain through', () => {
    expect(checkScope('https://notmarketsite.example/oferty', scope).inScope).toBe(false);
    expect(checkScope('https://marketsite.example.evil.example/oferty', scope).inScope).toBe(false);
  });

  it('refuses out-of-path URLs and non-http protocols', () => {
    expect(checkScope('https://marketsite.example/konto/ustawienia', scope).refusal?.rule).toBe(
      'scope:path',
    );
    expect(checkScope('mailto:a@b.pl', scope).refusal?.rule).toBe('scope:protocol');
    expect(checkScope('javascript:alert(1)', scope).inScope).toBe(false);
  });

  it('lets external links through under policy follow', () => {
    expect(
      checkScope('https://other.example/x', { ...scope, external_link_policy: 'follow' }),
    ).toMatchObject({ inScope: true, external: true });
  });
});

describe('checkBudgets', () => {
  const ok = { depth: 1, states: 0, actionsInState: 0, elapsedMs: 0, steps: 0 };
  it('passes under every cap', () => expect(checkBudgets(ok, scope)).toBeNull());
  it.each([
    [{ depth: 4 }, 'budget:max_depth'],
    [{ states: 10 }, 'budget:max_states'],
    [{ actionsInState: 5 }, 'budget:max_actions_per_state'],
    [{ elapsedMs: 10 * 60_000 }, 'budget:max_run_time_minutes'],
    [{ steps: 100 }, 'budget:max_steps'],
  ])('%j exhausts a budget', (patch, rule) => {
    expect(checkBudgets({ ...ok, ...patch }, scope)).toMatchObject({
      status: 'budget_reached',
      rule,
    });
  });
});

describe('narrowScope', () => {
  it('only restricts', () => {
    const n = narrowScope(
      scope,
      { max_depth: 2, max_states: 99, allowed_paths: ['/oferty/laptopy/*', '/konto/*'] },
      { max_steps: 50 },
    );
    expect(n.max_depth).toBe(2);
    expect(n.max_states).toBe(10);
    expect(n.max_steps).toBe(50);
    expect(n.allowed_paths).toEqual(['/oferty/laptopy/*']);
  });
});

const DENYLIST = [
  'logout',
  'delete',
  'payment',
  'bidding',
  'buy_now',
  'message_or_contact_seller',
  'reveal_seller_contact',
  'path:/oferty/wystaw/*',
];

describe('checkDenylist', () => {
  it.each([
    ['logout', { role: 'button', name: 'Wyloguj się' }],
    ['delete', { role: 'button', name: 'Usuń ofertę' }],
    ['payment', { role: 'button', name: 'Zapłać' }],
    ['bidding', { role: 'button', name: 'Licytuj' }],
    ['buy_now', { role: 'button', name: 'Kup teraz' }],
    ['message_or_contact_seller', { role: 'button', name: 'Napisz do sprzedawcy' }],
    ['reveal_seller_contact', { role: 'button', name: 'Pokaż numer telefonu' }],
  ])('refuses %s actions and names the rule', (rule, descriptor) => {
    const r = checkDenylist(DENYLIST, { classification: classifyAction(descriptor) });
    expect(r).toMatchObject({ status: 'denylisted', rule });
  });

  it('refuses a `path:` glob when the URL is proposed to navigate', () => {
    expect(
      checkDenylist(DENYLIST, { url: 'https://marketsite.example/oferty/wystaw/nowa' }),
    ).toMatchObject({
      status: 'denylisted',
      rule: 'path:/oferty/wystaw/*',
    });
  });

  it.each([
    ['/wyloguj', 'logout'],
    ['/logout', 'logout'],
    ['/konto/oferty/5/usun', 'delete'],
    ['/zamowienie/platnosc', 'payment'],
    ['/payment/start', 'payment'],
    ['/oferta/1/licytuj', 'bidding'],
    ['/oferta/1/kup-teraz', 'buy_now'],
  ])('refuses built-in path %s (%s) on navigate', (path, rule) => {
    expect(checkDenylist(DENYLIST, { url: `https://marketsite.example${path}` })).toMatchObject({
      rule,
    });
  });

  it('lets read URLs and actions through, and only enforces listed rule ids', () => {
    expect(
      checkDenylist(DENYLIST, {
        url: 'https://marketsite.example/oferty/laptopy',
        classification: classifyUrl('/oferty/laptopy'),
      }),
    ).toBeNull();
    expect(checkDenylist(['payment'], { url: 'https://marketsite.example/wyloguj' })).toBeNull();
  });
});
