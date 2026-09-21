import { describe, expect, it } from 'vitest';
import { buildLocators, type ElementFacts } from '../src/locators.js';

const kinds = (el: ElementFacts) => buildLocators(el).map((l) => l.kind);

describe('buildLocators', () => {
  it('ranks role+name, then label/text, then test_id, then container', () => {
    const l = buildLocators({
      role: 'button',
      name: 'Zapłać',
      testId: 'pay-btn',
      ancestors: ['main', 'form "Płatność"'],
    });
    expect(l.map((x) => x.kind)).toEqual(['role', 'text', 'test_id', 'container']);
    expect(l.map((x) => x.rank)).toEqual([0, 1, 2, 3]);
    expect(l[0]!.value).toBe('role=button[name="Zapłać"]');
    expect(l[1]!.value).toBe('Zapłać');
    expect(l[2]!.value).toBe('pay-btn');
    expect(l[3]!.value).toBe('main > form "Płatność" > button "Zapłać"');
  });

  it('prefers a label for form controls over plain text', () => {
    const l = buildLocators({
      role: 'textbox',
      name: 'Adres e-mail',
      label: 'Adres e-mail',
      ancestors: ['form "Logowanie"'],
    });
    expect(l.map((x) => x.kind)).toEqual(['role', 'label', 'container']);
  });

  it('always includes a test_id candidate when the element exposes one', () => {
    for (const role of ['button', 'link', 'textbox', 'checkbox', 'tab']) {
      expect(kinds({ role, name: null, testId: 'x', ancestors: [] })).toContain('test_id');
      expect(kinds({ role, name: 'N', testId: 'x', ancestors: ['main'] })).toContain('test_id');
    }
    expect(kinds({ role: 'button', name: 'N', ancestors: [] })).not.toContain('test_id');
  });

  it('gives an element without an accessible name at least a text or container candidate', () => {
    const l = buildLocators({ role: 'button', name: null, ancestors: ['main', 'form "X"'] });
    expect(l.map((x) => x.kind)).toEqual(['container']);
    expect(l[0]!.value).toBe('main > form "X" > button');
    expect(
      buildLocators({ role: 'button', name: null, text: 'OK', ancestors: [] }).map((x) => x.kind),
    ).toEqual(['text', 'container']);
  });

  it('numbers repeats so each is addressable', () => {
    const l = buildLocators({ role: 'button', name: 'Dodaj', nth: 2, ancestors: ['main'] });
    expect(l[0]!.value).toBe('role=button[name="Dodaj"] >> nth=2');
    expect(l.at(-1)!.value).toBe('main > button "Dodaj" >> nth=2');
    expect(buildLocators({ role: 'button', name: 'Dodaj', nth: 0, ancestors: [] })[0]!.value).toBe(
      'role=button[name="Dodaj"]',
    );
  });

  it('escapes quotes in names', () => {
    expect(buildLocators({ role: 'link', name: 'Laptop 15" Dell', ancestors: [] })[0]!.value).toBe(
      'role=link[name="Laptop 15\\" Dell"]',
    );
  });

  it('ranks are contiguous from 0', () => {
    const l = buildLocators({ role: 'link', name: 'A', testId: 't', ancestors: ['nav'] });
    expect(l.map((x) => x.rank)).toEqual(l.map((_, i) => i));
  });
});
