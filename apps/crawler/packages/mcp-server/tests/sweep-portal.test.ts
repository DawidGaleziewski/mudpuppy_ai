import { describe, expect, it } from 'vitest';
import { isStated } from '../src/services/ba/rule-pass-check.js';
import { findBands, sweepGrid } from '../src/sweep-portal.js';

/** Spec 080 FR-003 (R-97 (4)): band edges of one input, found by halving gaps. */
/** The reference portal's engine bands (R05). */
const BANDS: [number, string][] = [
  [1400, '0,90'],
  [2000, '1,00'],
  [Infinity, '1,25'],
];
const factor = (cc: number) => BANDS.find(([upTo]) => cc <= upTo)![1];
const plan = {
  label: 'Pojemność silnika (cm³)',
  attribute: 'input.pojemność_silnika_cm',
  min: 50,
  max: 8000,
};

describe('findBands', () => {
  it('finds both edges of the engine factor, ignoring a value that echoes the input', async () => {
    const asked: number[] = [];
    const { bands } = await findBands(
      plan,
      (cc) => {
        asked.push(cc);
        return Promise.resolve({
          'shown.współczynnik_silnika': factor(cc),
          'shown.pojemność': String(cc),
        });
      },
      60,
    );
    expect(bands.map((b) => [b.below, b.above])).toEqual([
      [1400, 1401],
      [2000, 2001],
    ]);
    expect(bands[0]!.changed).toEqual([
      { name: 'shown.współczynnik_silnika', below: '0,90', above: '1,00' },
    ]);
    expect(new Set(asked).size).toBe(asked.length); // every value replayed once
  });

  it('stops at the budget and skips gaps with no answer', async () => {
    const { bands, asked } = await findBands(plan, () => Promise.resolve(null), 60);
    expect(bands).toEqual([]);
    expect(asked).toBe(sweepGrid(50, 8000).length);
    const capped = await findBands(plan, (cc) => Promise.resolve({ f: factor(cc) }), 6);
    expect(capped.asked).toBe(6);
  });
});

describe('a band edge in the rules pass', () => {
  const edge = {
    text: '"Pojemność silnika (cm³)" 1400 → 1401 changes what the page shows: współczynnik_silnika 0,90 → 1,00',
    field: 'Pojemność silnika (cm³)',
    route: '/kalkulator/wynik',
    source: 'sweep' as const,
    numbers: ['1400', '1401'],
  };
  it('is stated by a rule naming the field and both numbers', () => {
    expect(isStated(edge, ['the engine factor is 0.9 up to 1400 cm3'])).toBe(false);
    expect(
      isStated(edge, [
        'współczynnik silnika: 0.9 for pojemność silnika (cm³) up to 1400, 1.0 from 1401',
      ]),
    ).toBe(true);
  });
});
