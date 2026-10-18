import { describe, expect, it } from 'vitest';
import {
  PROBES,
  planTries,
  unknownProbes,
  wrongValue,
  type ProbeContext,
  type ProbeField,
  type ProbeValue,
} from '../src/index.js';

// SC-19 step 1 and step 2 as the form reader returns them (spec 032 research).
const STEP1: ProbeField[] = [
  { index: 0, tag: 'input', type: 'text', label: 'Full name', required: true, maxlength: 40 },
  { index: 1, tag: 'input', type: 'email', label: 'E-mail', required: true },
  {
    index: 2,
    tag: 'input',
    type: 'text',
    label: 'Postal code',
    required: true,
    pattern: '[0-9]{2}-[0-9]{3}',
  },
  {
    index: 3,
    tag: 'input',
    type: 'number',
    label: 'Year of birth',
    required: true,
    min: '1900',
    max: '2008',
  },
];
const STEP2: ProbeField[] = [
  { index: 0, tag: 'input', type: 'radio', label: 'Private', required: false, group: 'type' },
  { index: 1, tag: 'input', type: 'radio', label: 'Business', required: false, group: 'type' },
  {
    index: 2,
    tag: 'input',
    type: 'text',
    label: 'Start date',
    required: false,
    placeholder: 'DD.MM.YYYY',
  },
  { index: 3, tag: 'input', type: 'text', label: 'Promo code (optional)', required: false },
];
const ctx = (fields: ProbeField[], base: [number, ProbeValue][]): ProbeContext => ({
  fields,
  base: new Map(base),
});
const base1 = ctx(STEP1, [
  [0, 'Test Person'],
  [1, 'test@example.test'],
  [2, '00-950'],
  [3, '1990'],
]);
const base2 = ctx(STEP2, [
  [0, true],
  [2, '01.01.2027'],
  [3, 'Test'],
]);
const all = (c: ProbeContext) => planTries(c, { limit: 100 }).tries;

describe('probe catalogue (spec 032 US2)', () => {
  it('defines every probe once, with a summary and a proving scar', () => {
    expect(new Set(PROBES.map((p) => p.id)).size).toBe(PROBES.length);
    for (const p of PROBES)
      expect([p.summary.length > 0, p.scars.length > 0]).toEqual([true, true]);
  });

  it('tries empty, wrong formats and boundaries on step 1, each touching only its field', () => {
    const keys = all(base1).map((t) => t.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'required-empty-all',
        'required-empty-one:E-mail',
        'wrong-format:E-mail',
        'wrong-format:Postal code',
        'wrong-format:Year of birth',
        'boundary:Year of birth:min',
        'boundary:Year of birth:max',
        'http-500',
        'block-request',
        'delay',
        'offline',
      ]),
    );
    const emptyAll = all(base1).find((t) => t.key === 'required-empty-all')!;
    expect(emptyAll.writes).toEqual([0, 1, 2, 3].map((index) => ({ index, value: '' })));
    const max = all(base1).find((t) => t.key === 'boundary:Year of birth:max')!;
    expect(max.writes).toEqual([{ index: 3, value: '2009' }]);
    // A script-written value gets past maxlength unflagged: no try for it (F-06@032).
    expect(keys.some((k) => k.endsWith(':maxlength'))).toBe(false);
    expect(all(base1).some((t) => t.group === 'branch')).toBe(false);
  });

  it('tries the other radio option as a branch and leaves the optional fields empty once', () => {
    const tries = all(base2);
    const business = tries.find((t) => t.key === 'option:type=Business')!;
    expect(business).toMatchObject({ group: 'branch', target: 'type = Business' });
    expect(business.writes).toEqual([
      { index: 0, value: false },
      { index: 1, value: false },
      { index: 1, value: true },
    ]);
    expect(tries.find((t) => t.key === 'option:type=Private')).toBeUndefined();
    expect(tries.find((t) => t.key === 'optional-empty')!.writes).toEqual([
      { index: 2, value: '' },
      { index: 3, value: '' },
    ]);
    expect(tries.find((t) => t.key === 'wrong-format:Start date')).toBeDefined();
  });

  it('shares the budget round-robin and lists what did not fit', () => {
    const { tries, skipped } = planTries(base1, { limit: 5 });
    expect(tries.map((t) => t.probe)).toEqual([
      'required-empty-all',
      'http-500',
      'block-request',
      'wrong-format',
      'required-empty-one',
    ]);
    expect(skipped.length + tries.length).toBe(all(base1).length);
    expect(skipped).toContain('offline');
  });

  it('keeps only the asked probes or groups, and can leave technical ones out', () => {
    expect(planTries(base1, { limit: 50, only: ['technical'] }).tries.map((t) => t.probe)).toEqual([
      'http-500',
      'block-request',
      'delay',
      'offline',
    ]);
    expect(planTries(base1, { limit: 50, noTechnical: true }).tries.some((t) => t.fault)).toBe(
      false,
    );
    expect(unknownProbes(['branch', 'wrong-format', 'nonsense'])).toEqual(['nonsense']);
  });

  it('knows a wrong value per typed field, and none for a free text field', () => {
    expect(wrongValue(STEP1[1]!)).toBe('not-an-address');
    expect(wrongValue(STEP2[2]!)).toBe('wrong');
    expect(wrongValue(STEP2[3]!)).toBeNull();
    expect(
      wrongValue({
        index: 0,
        tag: 'input',
        type: 'text',
        label: 'Kod',
        required: true,
        placeholder: '00-000',
      }),
    ).toBe('wrong');
  });
});

describe('the reference calculator within the default budget (spec 036 FR-008, F-17@034)', () => {
  // The vehicle and driver steps as the form reader returns them; 24 is the owner's per-step budget.
  const num = (index: number, label: string, min: string, max: string): ProbeField => ({
    index,
    tag: 'input',
    type: 'number',
    label,
    required: true,
    min,
    max,
  });
  const VEHICLE: ProbeField[] = [
    {
      index: 0,
      tag: 'select',
      type: 'select',
      label: 'Marka',
      required: true,
      options: [
        { value: '', text: 'Wybierz', disabled: false },
        { value: 'toyota', text: 'Toyota', disabled: false },
      ],
    },
    { index: 1, tag: 'input', type: 'text', label: 'Model', required: true },
    num(2, 'Rok produkcji', '1980', '2026'),
    num(3, 'Pojemność silnika (cm³)', '50', '8000'),
    {
      index: 4,
      tag: 'input',
      type: 'text',
      label: 'Kod pocztowy',
      required: true,
      pattern: '\\d{2}-\\d{3}',
    },
  ];
  const DRIVER: ProbeField[] = [
    { index: 0, tag: 'input', type: 'date', label: 'Data urodzenia', required: true },
    num(1, 'Rok uzyskania prawa jazdy', '1968', '2026'),
    num(2, 'Lata bezszkodowej jazdy', '0', '60'),
  ];
  const keys = (fields: ProbeField[], base: [number, ProbeValue][]) =>
    planTries(ctx(fields, base), { limit: 24 }).tries.map((t) => t.key);

  it('tries both limits of every number box and the postcode format', () => {
    const vehicle = keys(VEHICLE, [
      [0, 'toyota'],
      [1, 'Corolla'],
      [2, '2015'],
      [3, '1600'],
      [4, '00-950'],
    ]);
    const driver = keys(DRIVER, [
      [0, '1985-05-05'],
      [1, '2005'],
      [2, '10'],
    ]);
    for (const label of ['Rok produkcji', 'Pojemność silnika (cm³)'])
      for (const side of ['min', 'max']) expect(vehicle).toContain(`boundary:${label}:${side}`);
    expect(vehicle).toContain('wrong-format:Kod pocztowy');
    for (const label of ['Rok uzyskania prawa jazdy', 'Lata bezszkodowej jazdy'])
      for (const side of ['min', 'max']) expect(driver).toContain(`boundary:${label}:${side}`);
  });
});
