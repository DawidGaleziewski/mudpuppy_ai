import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { builtinRuleSet } from '@pathfinder/safety';
import { attachLocators, classifyCandidates, extractCandidates } from '../src/action-extractor.js';

const aria = (n: string) =>
  readFileSync(new URL(`../../../tests/fixtures/aria/${n}`, import.meta.url), 'utf8');

describe('extractCandidates', () => {
  it('extracts links with their /url, buttons and skips non-clickable roles', () => {
    const c = extractCandidates(aria('form-login.yaml'));
    const byName = Object.fromEntries(c.map((x) => [`${x.role}:${x.name}`, x]));
    expect(byName['link:Elektronika']!.href).toBe('/oferty/elektronika');
    expect(byName['button:Szukaj']).toBeDefined();
    expect(byName['button:Zaloguj']).toBeDefined();
    expect(byName['checkbox:Zapamiętaj mnie']).toBeDefined();
    expect(
      c.some((x) => x.role === 'heading' || x.role === 'textbox' || x.role === 'searchbox'),
    ).toBe(false);
  });

  it('records ancestors and treats a search landmark as a search form', () => {
    const c = extractCandidates(aria('form-login.yaml'));
    const search = c.find((x) => x.name === 'Szukaj')!;
    expect(search.descriptor.form?.purpose).toBe('search');
    const login = c.find((x) => x.name === 'Zaloguj')!;
    expect(login.ancestors.join('>')).toContain('form "Logowanie"');
  });

  it('numbers repeats of the same role and name so each can be located', () => {
    const c = extractCandidates(
      [
        '- main:',
        '    - button "Dodaj do ulubionych"',
        '    - button "Dodaj do ulubionych"',
        '    - button "Inny"',
      ].join('\n'),
    );
    expect(c.filter((x) => x.name === 'Dodaj do ulubionych').map((x) => x.nth)).toEqual([0, 1]);
    expect(c.find((x) => x.name === 'Inny')!.nth).toBe(0);
  });

  it('unescapes quoted names and attaches /url only to the preceding link', () => {
    const c = extractCandidates(
      ['- link "Laptop 15\\" Dell":', '    - /url: /oferta/1', '- button "Kup teraz"'].join('\n'),
    );
    expect(c[0]).toMatchObject({ name: 'Laptop 15" Dell', href: '/oferta/1' });
    expect(c[1]!.href).toBeUndefined();
  });

  it('joins DOM form semantics: a POST form with a password makes its button non-read', () => {
    const snap = ['- form "Logowanie":', '    - button "Zaloguj"'].join('\n');
    const withDom = classifyCandidates(
      extractCandidates(snap, [
        {
          name: 'Logowanie',
          method: 'POST',
          action: 'https://x.pl/login',
          hasPassword: true,
          purpose: 'other',
          fields: [],
        },
      ]),
      builtinRuleSet(),
    );
    expect(withDom[0]!.safetyClass).toBe('mutating');
  });

  it("skips a native select's options but keeps the select and a custom listbox's options", () => {
    const snap = [
      '- combobox "Miasto":',
      '  - option "Wybierz miasto" [selected]',
      '  - option "Kraków"',
      '- combobox "Produkt" [expanded]',
      '- listbox "Produkt":',
      '  - option "OC/AC"',
      '- link "Kontakt":',
      '  - /url: /kontakt',
    ].join('\n');
    const c = extractCandidates(snap).map((x) => `${x.role}:${x.name}`);
    expect(c).toEqual(['combobox:Miasto', 'combobox:Produkt', 'option:OC/AC', 'link:Kontakt']);
  });

  it('caps the number of candidates per state', () => {
    const many = Array.from({ length: 500 }, (_, i) => `- link "L${i}":\n    - /url: /x/${i}`).join(
      '\n',
    );
    expect(extractCandidates(many).length).toBe(200);
  });
});

describe('classifyCandidates', () => {
  it('classifies the listing fixtures: navigation is read, dangerous buttons are not', () => {
    const snap = [
      '- main:',
      '    - link "Elektronika":',
      '        - /url: /oferty/elektronika',
      '    - button "Licytuj"',
      '    - button "Kup teraz"',
      '    - button "Pokaż numer telefonu"',
      '    - link "Wyloguj się":',
      '        - /url: /wyloguj',
    ].join('\n');
    const r = Object.fromEntries(
      classifyCandidates(extractCandidates(snap), builtinRuleSet()).map((c) => [
        c.name,
        c.safetyClass,
      ]),
    );
    expect(r).toEqual({
      Elektronika: 'read',
      Licytuj: 'external-side-effect',
      'Kup teraz': 'external-side-effect',
      'Pokaż numer telefonu': 'external-side-effect',
      'Wyloguj się': 'destructive',
    });
  });
});

describe('attachLocators', () => {
  const snap = [
    '- main:',
    '    - form "Zamówienie":',
    '        - button "Zapłać"',
    '    - button "Dodaj"',
    '    - button "Dodaj"',
    '    - link "Bez id":',
    '        - /url: /x',
  ].join('\n');

  it('adds role, text and container candidates, and a test_id when the element has one', () => {
    const cands = extractCandidates(snap);
    const locs = attachLocators(cands, [
      { testId: 'pay', role: 'button', name: 'Zapłać', label: '' },
    ]);
    const pay = locs[cands.findIndex((c) => c.name === 'Zapłać')]!;
    expect(pay.map((l) => l.kind)).toEqual(['role', 'text', 'test_id', 'container']);
    expect(pay.find((l) => l.kind === 'test_id')!.value).toBe('pay');
    expect(pay.find((l) => l.kind === 'container')!.value).toBe(
      'main > form "Zamówienie" > button "Zapłać"',
    );
    const other = locs[cands.findIndex((c) => c.name === 'Bez id')]!;
    expect(other.map((l) => l.kind)).toEqual(['role', 'text', 'container']);
  });

  it('matches repeated elements to their own test ids by order, and skips ambiguous ones', () => {
    const cands = extractCandidates(snap);
    const dup = cands.map((c, i) => [c, i] as const).filter(([c]) => c.name === 'Dodaj');
    const both = attachLocators(cands, [
      { testId: 'add-1', role: 'button', name: 'Dodaj', label: '' },
      { testId: 'add-2', role: 'button', name: 'Dodaj', label: '' },
    ]);
    expect(dup.map(([, i]) => both[i]!.find((l) => l.kind === 'test_id')?.value)).toEqual([
      'add-1',
      'add-2',
    ]);
    // only one of two repeats has an id: which one is unknowable from the ARIA tree, so none is claimed
    const one = attachLocators(cands, [
      { testId: 'add-1', role: 'button', name: 'Dodaj', label: '' },
    ]);
    expect(dup.map(([, i]) => one[i]!.some((l) => l.kind === 'test_id'))).toEqual([false, false]);
  });

  it('every candidate gets at least one locator', () => {
    const cands = extractCandidates(snap);
    for (const l of attachLocators(cands)) expect(l.length).toBeGreaterThan(0);
  });
});
