import { describe, expect, it } from 'vitest';
import { classifyAction, classifyUrl } from '../src/index.js';
import { labeledActions } from './fixtures.js';

describe('classifyAction', () => {
  it('has fixtures for every class', () => {
    expect(new Set(labeledActions.map((a) => a.expected))).toEqual(
      new Set(['read', 'mutating', 'destructive', 'external-side-effect']),
    );
  });

  it.each(labeledActions.map((a) => [a.id, a] as const))('classifies %s as expected', (_id, a) => {
    expect(classifyAction(a.descriptor).safetyClass).toBe(a.expected);
  });

  it('returns the most dangerous class across signals', () => {
    const r = classifyAction({ role: 'button', name: 'Kup teraz i usuń z ulubionych' });
    expect(r.safetyClass).toBe('external-side-effect');
    expect(r.rules).toEqual(expect.arrayContaining(['purchase', 'delete']));
  });

  it('resolves ambiguous or conflicting signals to non-read', () => {
    // read-looking link whose target is a logout URL; search button that POSTs; unknown control
    expect(
      classifyAction({ role: 'link', name: 'Moje konto', href: '/wyloguj' }).safetyClass,
    ).not.toBe('read');
    expect(
      classifyAction({
        role: 'button',
        name: 'Szukaj',
        form: { method: 'POST', purpose: 'search' },
      }).safetyClass,
    ).not.toBe('read');
    expect(classifyAction({ role: 'button', name: 'Coś dziwnego' }).safetyClass).not.toBe('read');
  });

  it('cannot be lowered by a persona- or agent-supplied class', () => {
    const bid = { role: 'button', name: 'Licytuj' };
    expect(classifyAction({ ...bid, claimedClass: 'read' }).safetyClass).toBe(
      'external-side-effect',
    );
    expect(classifyAction({ ...bid, claimedClass: 'mutating' }).safetyClass).toBe(
      'external-side-effect',
    );
  });

  it('can be raised by a claimed class', () => {
    expect(
      classifyAction({
        role: 'link',
        name: 'Elektronika',
        href: '/oferty/elektronika',
        claimedClass: 'destructive',
      }).safetyClass,
    ).toBe('destructive');
  });

  it('is data-driven: rule ids are reported for the matching signals', () => {
    expect(classifyAction({ role: 'button', name: 'Pokaż numer telefonu' }).rules).toEqual([
      'reveal_contact',
    ]);
    expect(classifyAction({ role: 'link', name: 'Dalej', href: '/koszyk/platnosc' }).rules).toEqual(
      ['payment'],
    );
  });
});

describe('classifyUrl', () => {
  it.each([
    ['https://marketsite.example/wyloguj', 'destructive', 'logout'],
    ['https://marketsite.example/logout?next=/', 'destructive', 'logout'],
    ['https://marketsite.example/konto/oferty/1/usun', 'destructive', 'delete'],
    ['https://marketsite.example/zamowienie/platnosc', 'external-side-effect', 'payment'],
    ['https://marketsite.example/oferta/1/licytuj', 'external-side-effect', 'purchase'],
    ['https://marketsite.example/oferta/1/kup-teraz', 'external-side-effect', 'purchase'],
  ])('%s -> %s (%s)', (url, cls, rule) => {
    const r = classifyUrl(url);
    expect(r.safetyClass).toBe(cls);
    expect(r.rules).toContain(rule);
  });

  it('treats ordinary pages, search and login pages as read', () => {
    for (const u of [
      'https://marketsite.example/oferty',
      '/oferty?q=macbook',
      '/konto/zaloguj',
      '/oferta/laptop-ID1',
    ]) {
      expect(classifyUrl(u).safetyClass).toBe('read');
    }
  });
});

describe('generic vocabulary (spec 002 US3)', () => {
  it.each([
    ['Kup teraz', 'purchase'],
    ['Licytuj', 'purchase'],
    ['Kup polisę', 'purchase'],
    ['Kup bilet', 'purchase'],
    ['Buy now', 'purchase'],
    ['Buy a policy', 'purchase'],
    ['Wyślij zapytanie', 'submit_request'],
    ['Poproś o ofertę', 'submit_request'],
    ['Zamów rozmowę', 'submit_request'],
    ['Zapisz się', 'submit_request'],
    ['Aplikuj', 'submit_request'],
    ['Request a quote', 'submit_request'],
    ['Subscribe', 'submit_request'],
    ['Apply now', 'submit_request'],
    ['Napisz do sprzedawcy', 'contact_or_message'],
    ['Send a message', 'contact_or_message'],
    ['Pokaż numer telefonu', 'reveal_contact'],
  ])('"%s" → %s (external-side-effect)', (name, rule) => {
    const r = classifyAction({ role: 'button', name });
    expect(r.safetyClass).toBe('external-side-effect');
    expect(r.rules).toContain(rule);
  });

  it('keeps an "apply filters" button read and a registration link followable', () => {
    expect(classifyAction({ role: 'button', name: 'Apply' }).safetyClass).toBe('read');
    expect(classifyAction({ role: 'button', name: 'Zastosuj filtry' }).safetyClass).toBe('read');
    expect(
      classifyAction({ role: 'link', name: 'Zarejestruj się', href: '/rejestracja' }).safetyClass,
    ).toBe('read');
  });
});
