import { describe, expect, it } from 'vitest';
import {
  controls,
  nameOf,
  planTries,
  revealedTries,
  type ProbeField,
  type ProbeValue,
} from '../src/index.js';

// The reference calculator's options step (spec 037, F-04@036): "Zakres" with "Tylko OC" chosen,
// and the box "OC + Autocasco (AC)" adds, as the form reader returns it after the choice.
const OPTIONS: ProbeField[] = [
  {
    index: 0,
    tag: 'input',
    type: 'radio',
    label: 'Tylko OC',
    required: true,
    group: 'zakres',
    groupLabel: 'Zakres',
  },
  {
    index: 1,
    tag: 'input',
    type: 'radio',
    label: 'OC + Autocasco (AC)',
    required: false,
    group: 'zakres',
    groupLabel: 'Zakres',
  },
  { index: 2, tag: 'input', type: 'checkbox', label: 'Assistance', required: false },
];
const BOX: ProbeField = {
  index: 2,
  tag: 'input',
  type: 'number',
  label: 'Wartość pojazdu (zł)',
  required: true,
  min: '5000',
  max: '500000',
};
const base = new Map<number, ProbeValue>([[0, true]]);

describe('a radio group by its visible name (FR-001)', () => {
  it('names the group "Zakres", and leaves it empty under that name', () => {
    expect(nameOf(controls(OPTIONS)[0]!)).toBe('Zakres');
    const empty = planTries({ fields: OPTIONS, base }, { limit: 24 }).tries.find(
      (t) => t.probe === 'required-empty-one',
    );
    expect(empty).toMatchObject({
      target: 'Zakres',
      writes: [
        { index: 0, value: false },
        { index: 1, value: false },
      ],
    });
  });
});

describe('fields an option reveals (FR-002)', () => {
  const ac = planTries({ fields: OPTIONS, base }, { limit: 24 }).tries.find(
    (t) => t.key === 'option:Zakres=OC + Autocasco (AC)',
  )!;
  const tries = revealedTries(ac, { fields: [BOX], base: new Map([[2, '20000']]) });

  it('tries the box empty, below its minimum and above its maximum, with AC chosen', () => {
    expect(tries.map((t) => t.key)).toEqual([
      'option:Zakres=OC + Autocasco (AC)/required-empty-one:Wartość pojazdu (zł)',
      'option:Zakres=OC + Autocasco (AC)/wrong-format:Wartość pojazdu (zł)',
      'option:Zakres=OC + Autocasco (AC)/boundary:Wartość pojazdu (zł):min',
      'option:Zakres=OC + Autocasco (AC)/boundary:Wartość pojazdu (zł):max',
    ]);
    for (const t of tries) expect(t).toMatchObject({ group: 'validation', writes: ac.writes });
    expect(tries.map((t) => t.after)).toEqual([
      [{ index: 2, value: '' }],
      [{ index: 2, value: 'abc' }],
      [{ index: 2, value: '4999' }],
      [{ index: 2, value: '500001' }],
    ]);
  });

  it('plans nothing from a validation try or from a try that is already on a revealed field', () => {
    expect(revealedTries({ ...ac, group: 'validation' }, { fields: [BOX], base })).toEqual([]);
    expect(revealedTries(tries[0]!, { fields: [BOX], base })).toEqual([]);
  });
});
