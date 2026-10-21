import { describe, expect, it } from 'vitest';
import {
  ageOf,
  attributeName,
  buildSignatures,
  canonicalJson,
  isHashedAsset,
  schemaHash,
  shownValues,
  snapshotAt,
  stepResult,
  typeValue,
  type AttributeWrite,
  type JourneyLink,
  type StepSignals,
} from '../src/index.js';

describe('build signatures (design § 5.2)', () => {
  const doc = (url: string) =>
    ({ url, kind: 'script', frame: 'main', loadedBy: 'document' }) as const;

  it('recognises content-hashed names and hash queries', () => {
    expect(isHashedAsset('https://p.pl/static/app.3e1a9c21.js')).toBe(true);
    expect(isHashedAsset('https://p.pl/static/main-AbCdEfGhIjKlMnOp.css')).toBe(true);
    expect(isHashedAsset('https://p.pl/app.js?v=17')).toBe(true);
    expect(isHashedAsset('https://p.pl/app.js')).toBe(false);
    expect(isHashedAsset('not a url')).toBe(false);
  });

  it('signs each scope by its sorted hashed asset paths, order-free', () => {
    const a = buildSignatures([
      doc('https://p.pl/a.3e1a9c21.js'),
      doc('https://p.pl/b.9c21aa00.css'),
    ]);
    const b = buildSignatures([
      doc('https://p.pl/b.9c21aa00.css'),
      doc('https://p.pl/a.3e1a9c21.js'),
    ]);
    expect(a).toEqual(b);
    expect(a[0]).toMatchObject({ scope: 'shell', source: 'assets' });
    expect(a[0]!.assets).toEqual(['/a.3e1a9c21.js', '/b.9c21aa00.css']);
  });

  it('a new bundle hash is a new build; the host does not matter', () => {
    const v1 = buildSignatures([doc('https://p.pl/a.3e1a9c21.js')])[0]!.signature;
    const v2 = buildSignatures([doc('https://p.pl/a.77777777.js')])[0]!.signature;
    const cdn = buildSignatures([doc('https://cdn.p.pl/a.3e1a9c21.js')])[0]!.signature;
    expect(v1).not.toBe(v2);
    expect(v1).toBe(cdn);
  });

  it('puts bundles loaded by script in their folder scope and frames in their own', () => {
    const sigs = buildSignatures([
      doc('https://p.pl/shell.3e1a9c21.js'),
      {
        url: 'https://p.pl/mfe/quote/remoteEntry.9c21aa00.js',
        kind: 'script',
        frame: 'main',
        loadedBy: 'script',
      },
      {
        url: 'https://pay.pl/x.12345678.js',
        kind: 'script',
        frame: 'https://pay.pl/form',
        loadedBy: 'document',
      },
    ]);
    expect(sigs.map((s) => s.scope)).toEqual(['frame:pay.pl/form', 'mfe:/mfe/quote', 'shell']);
  });

  it('no hashed assets: unknown; a marker names the shell', () => {
    expect(buildSignatures([doc('https://p.pl/app.js')])).toEqual([
      { scope: 'shell', signature: 'unknown', source: 'unknown', assets: [] },
    ]);
    expect(buildSignatures([], '2.14.0')[0]).toEqual({
      scope: 'shell',
      signature: 'marker:2.14.0',
      source: 'marker',
      assets: [],
    });
  });
});

describe('schema hash (design § 5.3)', () => {
  it('ignores key order and values, keeps types', () => {
    expect(schemaHash({ b: 'string', a: { x: 'integer' } })).toBe(
      schemaHash({ a: { x: 'integer' }, b: 'string' }),
    );
    expect(schemaHash({ a: 'integer' })).not.toBe(schemaHash({ a: 'string' }));
    expect(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] })).toBe('{"a":[{"c":2,"d":1}],"b":1}');
  });

  it('has no hash for a document response', () => {
    expect(schemaHash({ kind: 'document' })).toBeNull();
  });
});

describe('step results (design § 5.6)', () => {
  const base: StepSignals = {
    blocked: false,
    browserErrorPage: false,
    settled: true,
    validation: false,
    pageText: 'Twoja składka',
    businessErrors: ['Nie możemy zaproponować ubezpieczenia'],
  };

  it.each([
    [{ blocked: true, documentStatus: 500 }, 'blocked'],
    [{ browserErrorPage: true }, 'technical_error'],
    [{ documentStatus: 503 }, 'technical_error'],
    [{ blockingStatuses: [200, 502] }, 'technical_error'],
    [
      { pageText: 'Przykro nam. NIE możemy  zaproponować ubezpieczenia.', validation: true },
      'business_error',
    ],
    [{ validation: true, settled: false }, 'validation'],
    [{ settled: false }, 'timeout'],
    [{ documentStatus: 404 }, 'ok'],
    [{}, 'ok'],
  ] as const)('%o → %s', (over, expected) => {
    expect(stepResult({ ...base, ...over })).toBe(expected);
  });
});

describe('attribute snapshots (design § 5.8)', () => {
  const w = (journeyId: string, seq: number, name: string, valueText: string): AttributeWrite => ({
    journeyId,
    seq,
    name,
    source: name.startsWith('persona') ? 'persona' : 'input',
    valueType: 'text',
    valueNum: null,
    valueText,
  });
  const journeys = new Map<string, JourneyLink>([
    ['root', { id: 'root', parentId: null, branchSeq: null }],
    ['child', { id: 'child', parentId: 'root', branchSeq: 2 }],
  ]);
  const writes = [
    w('root', 0, 'persona.segment', 'standard'),
    w('root', 1, 'input.age', '30'),
    w('root', 3, 'input.age', '17'),
    w('child', 1, 'input.city', 'Kraków'),
  ];

  it('takes the latest write before the transition', () => {
    const s = snapshotAt(writes, journeys, 'root', 4);
    expect(s.get('input.age')?.valueText).toBe('17');
    expect(snapshotAt(writes, journeys, 'root', 2).get('input.age')?.valueText).toBe('30');
  });

  it('counts what the transition itself typed, not what it showed (F-21)', () => {
    // Map-mode autofill fills the form at the submit: those inputs are known before the press.
    expect(snapshotAt(writes, journeys, 'root', 3).get('input.age')?.valueText).toBe('17');
    const shown: AttributeWrite = { ...w('root', 3, 'shown.premium', '900'), source: 'shown' };
    expect(snapshotAt([...writes, shown], journeys, 'root', 3).has('shown.premium')).toBe(false);
    expect(snapshotAt([...writes, shown], journeys, 'root', 4).has('shown.premium')).toBe(true);
  });

  it('a child journey inherits its parent up to the branch point only', () => {
    const s = snapshotAt(writes, journeys, 'child', 2);
    expect(s.get('persona.segment')?.valueText).toBe('standard');
    expect(s.get('input.age')?.valueText).toBe('30'); // the 17 came after the branch
    expect(s.get('input.city')?.valueText).toBe('Kraków');
  });

  it('a name nobody wrote is missing, never a default', () => {
    expect(snapshotAt(writes, journeys, 'root', 4).has('input.city')).toBe(false);
    expect(snapshotAt(writes, journeys, 'root', 0).has('input.age')).toBe(false);
  });
});

describe('typing values', () => {
  it.each([
    ['1 234,56 zł', 'number', 1234.56],
    ['45000', 'number', 45000],
    ['1.234,50', 'number', 1234.5],
    ['3,5%', 'number', 3.5],
    ['12.5', 'number', 12.5],
    ['tak', 'bool', 1],
    ['00-950', 'text', null],
    ['', 'missing', null],
  ] as const)('%s → %s', (raw, type, num) => {
    const t = typeValue(raw);
    expect(t.valueType).toBe(type);
    expect(t.valueNum).toBe(num);
  });

  it('keeps dates as ISO text', () => {
    expect(typeValue('16.01.2008')).toEqual({
      valueType: 'date',
      valueNum: null,
      valueText: '2008-01-16',
    });
    expect(typeValue('2008-01-16').valueType).toBe('date');
  });

  it('names attributes from labels and derives ages', () => {
    expect(attributeName('Data urodzenia:')).toBe('data_urodzenia');
    expect(attributeName('Wartość pojazdu (zł)')).toBe('wartość_pojazdu_zł');
    expect(ageOf('2008-01-16', '2026-01-15T10:00:00.000Z')).toMatchObject({ years: 17 });
    expect(ageOf('2008-01-15', '2026-01-15T10:00:00.000Z')).toMatchObject({ years: 18 });
  });
});

describe('shown values (design § 5.8)', () => {
  it('reads definition lists, label: value text and tables, values unmasked', () => {
    const aria = [
      '- main:',
      '  - term: Składka',
      '  - definition: 1 234,56 zł',
      '  - paragraph: "Numer polisy: RP/2026/0001"',
      '  - table:',
      '    - row:',
      '      - columnheader "Wariant"',
      '      - columnheader "Cena"',
      '    - row:',
      '      - cell "OC"',
      '      - cell "980 zł"',
    ].join('\n');
    expect(shownValues(aria)).toEqual([
      { label: 'Składka', value: '1 234,56 zł' },
      { label: 'Numer polisy', value: 'RP/2026/0001' },
      { label: 'Wariant', value: 'OC' },
      { label: 'Cena', value: '980 zł' },
    ]);
  });

  it('reads a YAML-quoted text line with a colon', () => {
    expect(shownValues("- 'text: Okres ubezpieczenia: 12 miesięcy'")).toEqual([
      { label: 'Okres ubezpieczenia', value: '12 miesięcy' },
    ]);
  });
});
