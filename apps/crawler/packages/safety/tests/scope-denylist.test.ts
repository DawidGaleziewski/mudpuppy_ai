import { describe, expect, it } from 'vitest';
import {
  checkBudgets,
  checkDenylist,
  checkScope,
  classifyAction,
  classifyUrl,
  narrowScope,
  focusScope,
  FocusError,
  builtinRuleSet,
  extendRuleSet,
} from '../src/index.js';
import { BUILTIN_RULE_CLASSES, resolveRuleId } from '@pathfinder/config';

const scope = {
  allowed_domains: ['marketsite.example'],
  allowed_paths: ['/oferty/*', '/oferta/*', '/'],
  external_link_policy: 'record' as const,
  max_depth: 3,
  max_states: 10,
  max_actions_per_state: 5,
  max_run_time_minutes: 10,
  max_steps: 100,
  mfe_wait_ms: 10000,
  frame_depth: 3,
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

describe('focusScope (spec 011 FR-017)', () => {
  const wiki = {
    ...scope,
    allowed_domains: ['wikipedia.org'],
    allowed_paths: ['/*'],
  };
  const base = 'https://www.wikipedia.org/';

  it('narrows to one subdomain, a start page and excluded paths', () => {
    const s = focusScope(
      wiki,
      {
        start_url: 'https://en.wikipedia.org/',
        only_domains: ['en.wikipedia.org'],
        exclude_paths: ['/wiki/Special:*'],
      },
      base,
    );
    expect(s.allowed_domains).toEqual(['en.wikipedia.org']);
    expect(checkScope('https://en.wikipedia.org/wiki/Pickle', s).inScope).toBe(true);
    expect(checkScope('https://de.wikipedia.org/wiki/Gurke', s).refusal).toMatchObject({
      rule: 'scope:domain',
    });
    expect(checkScope('https://en.wikipedia.org/wiki/Special:Random', s).refusal).toMatchObject({
      status: 'out_of_scope',
      rule: 'scope:excluded_path',
      reason: '/wiki/Special:Random is excluded for this scan (/wiki/Special:*)',
    });
  });

  it('never widens: a host or path the portal does not allow is refused', () => {
    expect(() => focusScope(wiki, { only_domains: ['example.org'] }, base)).toThrow(FocusError);
    expect(() =>
      focusScope({ ...wiki, allowed_paths: ['/wiki/*'] }, { only_paths: ['/w/*'] }, base),
    ).toThrow(/path \/w\/\* not within/);
  });

  it('refuses a start page outside the focus', () => {
    // The portal's own start page (www.) is outside a focus on en. without a start_url.
    expect(() => focusScope(wiki, { only_domains: ['en.wikipedia.org'] }, base)).toThrow(
      /start page https:\/\/www\.wikipedia\.org\/ is outside the focus/,
    );
  });

  it('an empty focus leaves the scope as it was', () => {
    const s = focusScope(wiki, {}, base);
    expect(s.allowed_domains).toEqual(wiki.allowed_domains);
    expect(s.allowed_paths).toEqual(wiki.allowed_paths);
    expect(s.excluded_paths).toEqual([]);
  });
});

describe('checkDenylist', () => {
  it.each([
    ['logout', { role: 'button', name: 'Wyloguj się' }],
    ['delete', { role: 'button', name: 'Usuń ofertę' }],
    ['payment', { role: 'button', name: 'Zapłać' }],
    // aliases resolve to the generic id; the first listed alias of that id is reported (FR-013)
    ['bidding→purchase', { role: 'button', name: 'Licytuj' }],
    ['bidding→purchase', { role: 'button', name: 'Kup teraz' }],
    [
      'message_or_contact_seller→contact_or_message',
      { role: 'button', name: 'Napisz do sprzedawcy' },
    ],
    ['reveal_seller_contact→reveal_contact', { role: 'button', name: 'Pokaż numer telefonu' }],
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
    ['/oferta/1/licytuj', 'bidding→purchase'],
    ['/oferta/1/kup-teraz', 'bidding→purchase'],
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

describe('url: denylist entries (spec 002 FR-010, FR-011)', () => {
  const base = 'https://www.example.pl';
  it('matches path plus query and reports the entry as the rule', () => {
    expect(
      checkDenylist(['url:*itm_campaign=*'], { url: `${base}/emerytura/?itm_campaign=boks&x=1` }),
    ).toMatchObject({ status: 'denylisted', rule: 'url:*itm_campaign=*' });
    expect(checkDenylist(['url:*itm_campaign=*'], { url: `${base}/emerytura/` })).toBeNull();
  });

  it('refuses only the URL carrying the parameter (US2 independent test)', () => {
    const list = ['url:/*?*sessionId=*'];
    expect(checkDenylist(list, { url: `${base}/porady/?sessionId=abc` })).toMatchObject({
      status: 'denylisted',
      rule: 'url:/*?*sessionId=*',
    });
    expect(checkDenylist(list, { url: `${base}/porady/?a=1&sessionId=abc` })).not.toBeNull();
    expect(checkDenylist(list, { url: `${base}/porady/` })).toBeNull();
    expect(checkDenylist(list, { url: `${base}/porady/sessionId=abc` })).toBeNull();
  });

  it('path: entries keep ignoring the query (US2 scenario 2)', () => {
    expect(checkDenylist(['path:/porady/'], { url: `${base}/porady/?sessionId=1` })).toMatchObject({
      rule: 'path:/porady/',
    });
    expect(checkDenylist(['path:*sessionId*'], { url: `${base}/porady/?sessionId=1` })).toBeNull();
  });
});

describe('generic rule ids and aliases (spec 002 FR-012, FR-013)', () => {
  it.each([
    ['buy_now', 'Kup teraz', 'buy_now→purchase'],
    ['bidding', 'Licytuj', 'bidding→purchase'],
    [
      'message_or_contact_seller',
      'Napisz do sprzedawcy',
      'message_or_contact_seller→contact_or_message',
    ],
    ['reveal_seller_contact', 'Pokaż numer telefonu', 'reveal_seller_contact→reveal_contact'],
    ['purchase', 'Kup polisę', 'purchase'],
    ['submit_request', 'Wyślij zapytanie', 'submit_request'],
  ])('denylist %s refuses "%s" as %s', (entry, name, shown) => {
    const classification = classifyAction({ role: 'button', name });
    expect(checkDenylist([entry], { classification })).toMatchObject({
      status: 'denylisted',
      rule: shown,
    });
  });

  it('resolveRuleId maps each alias and passes other ids through', () => {
    expect(resolveRuleId('buy_now')).toEqual({ id: 'purchase', alias: 'buy_now' });
    expect(resolveRuleId('bidding')).toEqual({ id: 'purchase', alias: 'bidding' });
    expect(resolveRuleId('message_or_contact_seller')).toEqual({
      id: 'contact_or_message',
      alias: 'message_or_contact_seller',
    });
    expect(resolveRuleId('reveal_seller_contact')).toEqual({
      id: 'reveal_contact',
      alias: 'reveal_seller_contact',
    });
    expect(resolveRuleId('logout')).toEqual({ id: 'logout' });
  });

  it('config and safety agree on every built-in denylist id and its class', () => {
    for (const [id, cls] of Object.entries(BUILTIN_RULE_CLASSES))
      expect(builtinRuleSet().get(id)?.safetyClass, id).toBe(cls);
    const denylistable = builtinRuleSet()
      .rules.map((r) => r.id)
      .filter((id) => !id.startsWith('mutating:'));
    expect(denylistable.sort()).toEqual(Object.keys(BUILTIN_RULE_CLASSES).sort());
  });
});

describe('portal rule ids in the denylist (spec 002 US4 scenario 4)', () => {
  it('refuses matching actions as denylisted, like a built-in id', () => {
    const set = extendRuleSet(builtinRuleSet(), [
      {
        id: 'renew_policy',
        class: 'external-side-effect',
        keywords: ['przedłuż polisę'],
        paths: ['/przedluzenie/*'],
      },
    ]);
    const classification = classifyAction({ role: 'button', name: 'Przedłuż polisę' }, set);
    expect(checkDenylist(['renew_policy'], { classification }, set)).toMatchObject({
      status: 'denylisted',
      rule: 'renew_policy',
    });
    expect(
      checkDenylist(['renew_policy'], { url: 'https://x.pl/przedluzenie/start' }, set),
    ).toMatchObject({ status: 'denylisted', rule: 'renew_policy' });
  });
});
