import { describe, expect, it } from 'vitest';
import { hintsOf, isStated, type RuleCandidate } from '../src/services/ba/rule-pass-check.js';

const hint = (text: string, field: string | null, controls?: string[]): RuleCandidate => ({
  text,
  field,
  route: '/x',
  source: 'hint',
  ...(controls && { controls }),
});

describe('isStated (spec 045)', () => {
  it('does not take the number of an example ("WIOSNA10") for a limit', () => {
    const c = hint('Wielkie litery i dwie cyfry, np. WIOSNA10', 'Kod rabatowy');
    expect(isStated(c, ['kod rabatowy wiosna10 takes 10% off'])).toBe(false);
    expect(isStated(c, ['"kod rabatowy": wielkie litery i dwie cyfry, np. wiosna10'])).toBe(true);
  });

  it('needs a format word for a message without numbers', () => {
    const c: RuleCandidate = {
      text: 'Please match the requested format.',
      field: 'Kod pocztowy',
      route: '/x',
      source: 'message',
    };
    expect(isStated(c, ['the premium depends on kod pocztowy'])).toBe(false);
    expect(isStated(c, ['kod pocztowy must match the format nn-nnn'])).toBe(true);
  });

  it('needs one of the controls for a hint with numbers tied to none', () => {
    const c = hint('AC dostępne tylko dla pojazdów młodszych niż 15 lat.', null, [
      'OC + Autocasco (AC)',
    ]);
    expect(isStated(c, ['ac only for vehicles under 15 years'])).toBe(false);
    expect(isStated(c, ['"oc + autocasco (ac)" only for vehicles under 15 years'])).toBe(true);
  });
});

describe('hintsOf', () => {
  it('ties a hint to the control before it and lists all controls for a free one', () => {
    const snap = [
      '- main:',
      '  - paragraph: Wybierz dwa różne produkty.',
      '  - paragraph:',
      '    - combobox "Pierwszy produkt"',
      '    - text: Maksymalnie 2 produkty.',
      '  - combobox "Drugi produkt"',
    ].join('\n');
    expect(hintsOf(snap, new Set())).toEqual(
      [
        hint('Wybierz dwa różne produkty.', null, ['Pierwszy produkt', 'Drugi produkt']),
        { ...hint('Maksymalnie 2 produkty.', 'Pierwszy produkt'), route: '' },
      ].map((h, i) => (i === 0 ? { ...h, route: '' } : h)),
    );
  });
});
