import { describe, expect, it } from 'vitest';
import {
  ACTION_RULES,
  builtinRuleSet,
  checkDenylist,
  classifyAction,
  classifyUrl,
  extendRuleSet,
  ruleSetOf,
} from '../src/index.js';
import { labeledActions } from './fixtures.js';

describe('RuleSet seam (research §6)', () => {
  it('the built-in set holds exactly the built-in rules', () => {
    expect(builtinRuleSet().rules.map((r) => r.id)).toEqual(ACTION_RULES.map((r) => r.id));
    expect(builtinRuleSet().get('logout')?.safetyClass).toBe('destructive');
    expect(builtinRuleSet().get('nope')).toBeUndefined();
  });

  it.each(labeledActions.map((a) => [a.id, a] as const))(
    'classifyAction with and without an explicit set agree on %s',
    (_id, a) => {
      expect(classifyAction(a.descriptor, builtinRuleSet())).toEqual(classifyAction(a.descriptor));
    },
  );

  it('classifyUrl and checkDenylist agree with and without an explicit set', () => {
    for (const url of ['/wyloguj', '/oferta/123', '/kup-teraz/9', '/checkout']) {
      expect(classifyUrl(url, builtinRuleSet())).toEqual(classifyUrl(url));
      const classification = classifyUrl(url);
      expect(
        checkDenylist(
          ['logout', 'payment', 'path:/oferta/*'],
          { url, classification },
          builtinRuleSet(),
        ),
      ).toEqual(checkDenylist(['logout', 'payment', 'path:/oferta/*'], { url, classification }));
    }
  });

  it('two sets coexist without affecting each other', () => {
    const only = ruleSetOf([
      { id: 'custom', safetyClass: 'destructive', keywords: [/\bzniszcz\b/], paths: [] },
    ]);
    const d = { role: 'button', name: 'Zniszcz' };
    expect(classifyAction(d, only).rules).toEqual(['custom']);
    expect(classifyAction(d).rules).not.toContain('custom');
    expect(builtinRuleSet().get('custom')).toBeUndefined();
    expect(only.get('logout')).toBeUndefined();
  });
});

describe('portal action rules (spec 002 FR-015 to FR-019)', () => {
  const portalRules = [
    {
      id: 'renew_policy',
      class: 'external-side-effect' as const,
      keywords: ['przedłuż polisę'],
      paths: ['/przedluzenie/*'],
    },
    { id: 'purchase', keywords: ['jetzt kaufen'] },
    { id: 'logout', class: 'external-side-effect' as const, keywords: ['abmelden'] },
  ];
  const set = extendRuleSet(builtinRuleSet(), portalRules);

  it('adds a new rule with its class and origin', () => {
    expect(set.get('renew_policy')).toMatchObject({
      safetyClass: 'external-side-effect',
      origin: 'portal',
    });
    const r = classifyAction({ role: 'button', name: 'Przedłuż polisę' }, set);
    expect(r).toMatchObject({ safetyClass: 'external-side-effect', rules: ['renew_policy'] });
  });

  it('matches keywords after normalisation, on word boundaries only', () => {
    expect(classifyAction({ role: 'button', name: 'PRZEDLUZ POLISE teraz' }, set).rules).toContain(
      'renew_policy',
    );
    expect(classifyAction({ role: 'button', name: 'nieprzedłużpolisę' }, set).rules).not.toContain(
      'renew_policy',
    );
  });

  it('matches paths on links, form targets and navigate URLs', () => {
    expect(classifyUrl('https://x.pl/przedluzenie/start', set).rules).toEqual(['renew_policy']);
    expect(
      classifyAction({ role: 'link', name: 'Dalej', href: '/przedluzenie/krok-2' }, set),
    ).toMatchObject({ safetyClass: 'external-side-effect' });
  });

  it('extends a built-in rule: its own keywords still apply, the new ones are added', () => {
    expect(set.get('purchase')?.origin).toBe('builtin+portal');
    expect(classifyAction({ role: 'button', name: 'Jetzt kaufen' }, set).rules).toContain(
      'purchase',
    );
    expect(classifyAction({ role: 'button', name: 'Kup teraz' }, set).rules).toContain('purchase');
  });

  it('raises a built-in class when asked', () => {
    expect(set.get('logout')?.safetyClass).toBe('external-side-effect');
    expect(classifyAction({ role: 'button', name: 'Wyloguj' }, set).safetyClass).toBe(
      'external-side-effect',
    );
  });

  it('a portal keyword that also matches a read keyword makes the action non-read', () => {
    const s2 = extendRuleSet(builtinRuleSet(), [
      { id: 'search_quote', class: 'mutating', keywords: ['szukaj oferty'] },
    ]);
    expect(classifyAction({ role: 'button', name: 'Szukaj oferty' }, s2).safetyClass).toBe(
      'mutating',
    );
  });

  it('applies only to the set it was built for (FR-019)', () => {
    expect(builtinRuleSet().get('renew_policy')).toBeUndefined();
    expect(builtinRuleSet().get('purchase')?.origin).toBeUndefined();
    const other = extendRuleSet(builtinRuleSet(), []);
    expect(classifyAction({ role: 'button', name: 'Jetzt kaufen' }, other).rules).not.toContain(
      'purchase',
    );
  });
});
