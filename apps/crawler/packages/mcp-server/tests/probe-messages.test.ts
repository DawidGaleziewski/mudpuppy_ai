import { describe, expect, it } from 'vitest';
import { domMessages, textMessages } from '../src/runtime/pipeline/probe.js';

const page = (main: string[], banner = 'Witaj') =>
  ['- banner:', `  - paragraph: ${banner}`, '- main:', ...main.map((l) => `  ${l}`)].join('\n');

describe('textMessages (F-07@038, R-80 (1), spec 045)', () => {
  const before = page(['- heading "Zgłoś szkodę" [level=1]', '- paragraph: Krok 1 z 3']);

  it('keeps plain text the press made appear in the page body', () => {
    const after = page([
      '- heading "Zgłoś szkodę" [level=1]',
      '- paragraph: Krok 1 z 3',
      '- paragraph: Szkodę można zgłosić do 30 dni od zdarzenia.',
    ]);
    expect(domMessages(after)).toEqual([]);
    expect(textMessages(before, after)).toEqual([
      { field: null, text: 'Szkodę można zgłosić do 30 dni od zdarzenia.', source: 'dom-text' },
    ]);
  });

  it('ignores text that was there before and text in the header, menu or footer', () => {
    const after = page(
      ['- heading "Zgłoś szkodę" [level=1]', '- paragraph: Krok 1 z 3'],
      'Nowość!',
    );
    expect(textMessages(before, after)).toEqual([]);
  });

  it('keeps at most three texts', () => {
    const after = page([
      '- paragraph: Błąd A.',
      '- paragraph: Błąd B.',
      '- paragraph: Błąd C.',
      '- paragraph: Błąd D.',
    ]);
    expect(textMessages(before, after)).toHaveLength(3);
  });
});
