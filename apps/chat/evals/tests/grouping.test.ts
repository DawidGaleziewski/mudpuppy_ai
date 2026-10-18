import { describe, expect, it } from 'vitest';
import { covers, inOrder, scoreGrouping } from '../graders/index.js';
import type { Suggestion } from '../queries.js';
import type { GtProcess } from '../tasks.js';

const P01: GtProcess = {
  id: 'P01',
  firstRoute: '/kalkulator/pojazd',
  lastObservableRoute: '/kalkulator/wynik',
  observable: ['/kalkulator/pojazd', '/kalkulator/kierowca', '/kalkulator/opcje', '/kalkulator/wynik'],
  steps: [
    '/kalkulator/pojazd',
    '/kalkulator/kierowca',
    '/kalkulator/opcje',
    '/kalkulator/wynik',
    '/kalkulator/zakup',
  ],
};
const P04: GtProcess = {
  id: 'P04',
  firstRoute: '/kontakt',
  lastObservableRoute: '/kontakt',
  observable: ['/kontakt'],
  steps: ['/kontakt', '/kontakt/dziekujemy'],
};
const P05: GtProcess = {
  id: 'P05',
  firstRoute: '/moje-polisy/przedluz',
  lastObservableRoute: '/moje-polisy/przedluz',
  observable: ['/moje-polisy/przedluz'],
  steps: ['/moje-polisy/przedluz'],
};
const s = (name: string, routes: string[], why = 'linked by "Dalej"'): Suggestion => ({
  name,
  why,
  steps: routes.map((route, i) => ({ route, state_id: `${name}-${String(i)}` })),
});
const CALC = ['/kalkulator/pojazd', '/kalkulator/kierowca', '/kalkulator/opcje', '/kalkulator/wynik'];

describe('inOrder and covers', () => {
  it('needs every step in order; other screens may lie between', () => {
    expect(inOrder(['/', ...CALC], CALC)).toBe(true);
    expect(inOrder([CALC[1]!, CALC[0]!, CALC[2]!, CALC[3]!], CALC)).toBe(false);
    expect(covers(s('x', CALC.slice(0, 3)), P01)).toBe(false);
  });
});

describe('scoreGrouping', () => {
  const recorded = new Set([...CALC, '/', '/kontakt']);
  const base = { recorded, technical: new Set<string>(), followed: new Set(['Dalej']) };

  it('scores a reference cut at 100 % (each process once, from its own first screen)', () => {
    const g = scoreGrouping({
      ...base,
      processes: [P01, P04, P05],
      suggestions: [s('Kalkulator', CALC), s('Kontakt', ['/kontakt', '/kontakt/dziekujemy'])],
    });
    expect(g.scores.processes_found).toEqual({ matched: 2, total: 2, pct: 100 });
    expect(g.scores.clean_starts.pct).toBe(100);
    // "dziękujemy" is P04's later step, not an extra screen
    expect(g.checks).toMatchObject({ duplicates: 0, stubs: 0, unmatched: 0, extra_screens: 0 });
    expect(g.detail.P05).toMatch(/not in the store/);
  });

  it('marks a start on the home page, duplicates, stubs, error pages and a bare why', () => {
    const fromHome = s('Kalkulator', ['/', ...CALC]);
    const again = s('Kalkulator 2', CALC);
    const stub = s('Strona', ['/'], 'just a page');
    const broken: Suggestion = {
      ...s('Zepsuty', ['/kontakt']),
      steps: [{ route: '/kontakt', state_id: 'err' }],
    };
    const g = scoreGrouping({
      ...base,
      technical: new Set(['err']),
      processes: [P01, P04],
      suggestions: [fromHome, again, stub, broken],
    });
    expect(g.scores.processes_found).toEqual({ matched: 2, total: 2, pct: 100 });
    // home-page start counts against: 2 of 3 covering suggestions start where the process starts
    expect(g.scores.clean_starts).toEqual({ matched: 2, total: 3, pct: 66.7 });
    expect(g.checks).toMatchObject({
      duplicates: 1,
      stubs: 2,
      error_screens_inside: 1,
      unmatched: 1,
      extra_screens: 1, // the home page in front of the calculator
    });
    expect(g.scores.why_cites).toEqual({ matched: 3, total: 4, pct: 75 });
  });

  it('scores 0, never 100 %, with nothing to find or nothing suggested', () => {
    const g = scoreGrouping({ ...base, processes: [P01], suggestions: [] });
    expect(g.scores.processes_found.pct).toBe(0);
    expect(g.scores.clean_starts).toEqual({ matched: 0, total: 0, pct: 0 });
  });
});
