import { describe, expect, it } from 'vitest';
import { stepOutcomes } from '../src/step-outcomes.js';

const page = (...lines: string[]) => lines.join('\n');

const form = page(
  '- main:',
  '  - heading "Dane pojazdu" [level=1]',
  '  - form "Dane pojazdu":',
  '    - textbox "Model"',
  '    - button "Dalej"',
);

describe('stepOutcomes', () => {
  it('returns nothing when nothing observable changed', () => {
    const side = { url: 'https://x.pl/kalkulator/pojazd', title: 'Pojazd', snapshot: form };
    expect(stepOutcomes(side, side)).toEqual([]);
  });

  it('reports a title change and a route change', () => {
    const out = stepOutcomes(
      { url: 'https://x.pl/kalkulator/pojazd', title: 'Pojazd', snapshot: form },
      { url: 'https://x.pl/kalkulator/kierowca', title: 'Kierowca', snapshot: form },
    );
    expect(out).toEqual([
      'Title changed from "Pojazd" to "Kierowca"',
      'Route changed from /kalkulator/pojazd to /kalkulator/kierowca',
    ]);
  });

  it('reports query-only changes by parameter name, never by value, and a fragment change', () => {
    const out = stepOutcomes(
      { url: 'https://x.pl/szukaj?q=abc&strona=1', snapshot: form },
      { url: 'https://x.pl/szukaj?q=xyz&strona=1#wyniki', snapshot: form },
    );
    expect(out).toEqual(['URL query changed (parameters: q)', 'URL fragment changed']);
    expect(out.join(' ')).not.toContain('xyz');
  });

  it('accepts relative URLs and omits the title line when no title is known', () => {
    expect(stepOutcomes({ url: '/a', snapshot: form }, { url: '/b', snapshot: form })).toEqual([
      'Route changed from /a to /b',
    ]);
  });

  it('reports a dialog that was not there before, but not one that was', () => {
    const dialog = page(form, '- dialog "Zgoda na pliki cookie":', '  - button "Akceptuję"');
    const out = stepOutcomes({ url: '/a', snapshot: form }, { url: '/a', snapshot: dialog });
    expect(out).toContain('Dialog appeared: "Zgoda na pliki cookie"');
    expect(
      stepOutcomes({ url: '/a', snapshot: dialog }, { url: '/a', snapshot: dialog }).filter((o) =>
        o.startsWith('Dialog'),
      ),
    ).toEqual([]);
  });

  it('reports a new alert and its validation messages, in snapshot order', () => {
    const invalid = page(
      form,
      '- alert:',
      '  - paragraph: Popraw błędy w formularzu:',
      '  - list:',
      '    - listitem: Podaj imię.',
      '    - listitem: Wybierz temat.',
    );
    const out = stepOutcomes(
      { url: '/kontakt', snapshot: form },
      { url: '/kontakt', snapshot: invalid },
    );
    expect(out.slice(0, 3)).toEqual([
      'Alert appeared: "Popraw błędy w formularzu:"',
      'Validation message: "Podaj imię."',
      'Validation message: "Wybierz temat."',
    ]);
  });

  it('reports only the validation messages that are new', () => {
    const one = page(form, '- alert:', '  - list:', '    - listitem: Podaj imię.');
    const two = page(
      form,
      '- alert:',
      '  - list:',
      '    - listitem: Podaj imię.',
      '    - listitem: Wpisz wiadomość.',
    );
    const out = stepOutcomes({ url: '/k', snapshot: one }, { url: '/k', snapshot: two });
    expect(out.filter((o) => o.startsWith('Validation'))).toEqual([
      'Validation message: "Wpisz wiadomość."',
    ]);
  });

  it('reports element count changes per role, alphabetically', () => {
    const before = page('- main:', '  - link "A":', '    - /url: /a', '  - button "X"');
    const after = page(
      '- main:',
      '  - link "A":',
      '    - /url: /a',
      '  - link "B":',
      '    - /url: /b',
      '  - link "C":',
      '    - /url: /c',
      '  - textbox "Model"',
    );
    expect(stepOutcomes({ url: '/a', snapshot: before }, { url: '/a', snapshot: after })).toEqual([
      'button count changed from 1 to 0',
      'link count changed from 1 to 3',
      'textbox count changed from 0 to 1',
    ]);
  });

  it('is deterministic and keeps a fixed section order', () => {
    const alertAfter = page(
      '- dialog "D":',
      '- alert:',
      '  - paragraph: Błąd',
      '- main:',
      '  - link "A":',
      '    - /url: /a',
    );
    const args = [
      { url: '/a?x=1', title: 'T1', snapshot: '- main:' },
      { url: '/b?x=2', title: 'T2', snapshot: alertAfter },
    ] as const;
    const first = stepOutcomes(...args);
    expect(stepOutcomes(...args)).toEqual(first);
    const idx = (p: string) => first.findIndex((o) => o.startsWith(p));
    expect(idx('Title')).toBeLessThan(idx('Route'));
    expect(idx('Route')).toBeLessThan(idx('Dialog'));
    expect(idx('Dialog')).toBeLessThan(idx('Alert'));
    expect(idx('Alert')).toBeLessThan(idx('link count'));
  });
});
