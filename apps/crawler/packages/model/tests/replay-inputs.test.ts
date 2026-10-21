import { describe, expect, it } from 'vitest';
import { ageOf, birthDateFor, replayInputs } from '../src/index.js';

describe('replay inputs of a boundary test (spec 039 design § 11.5)', () => {
  it('a birth date half a year past the birthday gives exactly that age', () => {
    for (const years of [17, 18, 19, 0, 65]) {
      const born = birthDateFor(years, '2026-10-19T02:00:00.000Z');
      expect(ageOf(born, '2026-10-19')!.years).toBe(years);
    }
    expect(birthDateFor(18, '2026-02-28')).toBe('2007-08-28');
  });

  it('turns a changed derived age into the date field and keeps the other inputs', () => {
    const reference = {
      'input.data_urodzenia': '1980-05-01',
      'derived.input.data_urodzenia.age_years': 46,
      'input.marka': 'Fiat',
      'persona.segment': 'retail',
    };
    const out = replayInputs(
      { ...reference, 'derived.input.data_urodzenia.age_years': 17 },
      reference,
      '2026-10-19',
    );
    expect(out.values).toEqual({ 'input.data_urodzenia': '2009-04-19', 'input.marka': 'Fiat' });
    expect(out.unsupported).toEqual([]);
  });

  it("the age decides, whatever the replayed execution's own age was", () => {
    const test = {
      'input.data_urodzenia': '1980-05-01',
      'derived.input.data_urodzenia.age_years': 46,
    };
    // The test's date already gives 46: kept, even though the replayed execution was 46 too.
    expect(replayInputs(test, test, '2026-10-19').values).toEqual({
      'input.data_urodzenia': '1980-05-01',
    });
    // Another day, another age: the date follows the age.
    expect(replayInputs(test, test, '2026-01-15').values).toEqual({
      'input.data_urodzenia': '1979-07-15',
    });
  });

  it('a changed persona or shown value cannot be replayed', () => {
    const reference = { 'persona.segment': 'retail', 'input.marka': 'Fiat' };
    const out = replayInputs({ ...reference, 'persona.segment': 'vip' }, reference, '2026-10-19');
    expect(out.unsupported).toEqual(['persona.segment']);
    expect(out.values).toEqual({ 'input.marka': 'Fiat' });
  });
});
