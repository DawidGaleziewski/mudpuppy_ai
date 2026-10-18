import { describe, expect, it } from 'vitest';
import { extractCandidates, withFieldLabels, type DomForm } from '../src/index.js';

// spec 038, LO-48: the shop checkout's `<label>`s are not tied to their controls.
const CHECKOUT = `- main:
  - textbox
  - textbox
  - textbox "00-000"
  - combobox:
    - option "Wybierz miasto"
  - radio "Kurier"
  - button "Zamawiam i płacę"`;
const divForm = (labels: [string, string][]): DomForm => ({
  name: '',
  method: 'get',
  action: '',
  hasPassword: false,
  purpose: 'other',
  kind: 'div_form',
  fields: labels.map(([label, type]) => ({ name: label, type, required: false, label })),
});
const FORM = divForm([
  ['Imię i nazwisko', 'text'],
  ['E-mail', 'email'],
  ['Kod pocztowy', 'text'],
  ['Miasto', 'select'],
  ['delivery', 'radio'],
]);
const labels = (forms: DomForm[]) =>
  withFieldLabels(extractCandidates(CHECKOUT, [], { mode: 'trace' }), forms).map((c) => [
    c.role,
    c.name,
    c.label ?? null,
  ]);

describe('withFieldLabels', () => {
  it('gives each unnamed field the label the form reader found, in document order', () => {
    expect(labels([FORM])).toEqual([
      ['textbox', null, 'Imię i nazwisko'],
      ['textbox', null, 'E-mail'],
      // named by ARIA (its placeholder): kept as it is, no label added
      ['textbox', '00-000', null],
      ['combobox', null, 'Miasto'],
      ['radio', 'Kurier', null],
      ['button', 'Zamawiam i płacę', null],
    ]);
  });

  it('adds nothing when the counts disagree, so no label lands on the wrong field', () => {
    const short = divForm([
      ['Imię i nazwisko', 'text'],
      ['Miasto', 'select'],
    ]);
    const got = labels([short]);
    expect(got.filter(([role]) => role === 'textbox').every(([, , l]) => l === null)).toBe(true);
    // the one select still pairs with the one combobox
    expect(got.find(([role]) => role === 'combobox')).toEqual(['combobox', null, 'Miasto']);
  });

  it('leaves map-mode candidates alone (no inputs there)', () => {
    const map = withFieldLabels(extractCandidates(CHECKOUT, [], { mode: 'map' }), [FORM]);
    expect(map.some((c) => c.label !== undefined)).toBe(false);
  });
});
