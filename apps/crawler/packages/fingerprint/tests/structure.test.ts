import { describe, expect, it } from 'vitest';
import {
  buildTree,
  canonicalizeAria,
  collapsedText,
  computeComponents,
  computeFingerprint,
  keysForActions,
  minhashBlob,
  modelElementKeys,
} from '../src/index.js';

const tree = (aria: string) => buildTree(canonicalizeAria(aria).nodes);
const fp = (aria: string, routeTemplate = '/x') =>
  computeFingerprint({ routeTemplate, ariaSnapshot: aria });

const drivers = (n: number) =>
  [
    '- main:',
    '  - heading "Kierowcy" [level=1]',
    '  - list:',
    ...Array.from({ length: n }, (_, i) => [
      `    - listitem:`,
      `      - textbox "Imię kierowcy ${i + 1}"`,
      `      - textbox "Data urodzenia ${i + 1}"`,
    ]).flat(),
    '  - button "Dodaj kierowcę"',
  ].join('\n');

describe('fingerprint v2: repeated siblings (spec 039 design § 5.4)', () => {
  it('two and five rows of the same structure are one state (Repeated rows scenario)', () => {
    expect(fp(drivers(2)).level1).toBe(fp(drivers(5)).level1);
  });

  it('one row is not a repeat: a second row changes identity once, then never again', () => {
    expect(fp(drivers(1)).level1).not.toBe(fp(drivers(2)).level1);
    expect(fp(drivers(2)).level1).toBe(fp(drivers(3)).level1);
  });

  it('the text of repeated rows leaves identity; text outside them stays', () => {
    const list = (a: string, b: string, title: string) =>
      `- heading "${title}" [level=1]\n- list:\n  - listitem: ${a}\n  - listitem: ${b}`;
    expect(fp(list('Polisa OC', 'Polisa AC', 'Moje')).level1).toBe(
      fp(list('Dom', 'Podróż', 'Moje')).level1,
    );
    expect(fp(list('Dom', 'Podróż', 'Moje')).level1).not.toBe(
      fp(list('Dom', 'Podróż', 'Twoje')).level1,
    );
  });

  it('siblings of different structure are never collapsed', () => {
    const c = collapsedText(tree('- button "A"\n- link "B"\n- button "C"'));
    expect(c.identity).toBe('button "A"\nlink "B"\nbutton "C"');
  });

  it('marks a run as repeated without saying how long it is', () => {
    const c = collapsedText(tree(drivers(4)));
    expect(c.structure).toBe(
      'main\n  heading [level=1]\n  list\n    listitem [repeated]\n      textbox\n      textbox\n  button',
    );
    expect(collapsedText(tree(drivers(2))).structure).toBe(c.structure);
    expect(c.content).toBe('Kierowcy\nDodaj kierowcę');
  });

  it('never collapses leaves: a form keeps every field name, an added field changes identity', () => {
    const fields = (names: string[]) => names.map((n) => `- textbox "${n}"`).join('\n');
    const c = collapsedText(tree(fields(['Imię', 'Nazwisko'])));
    expect(c.identity).toBe('textbox "Imię"\ntextbox "Nazwisko"');
    expect(fp(fields(['Imię', 'Nazwisko'])).level1).not.toBe(
      fp(fields(['Imię', 'Nazwisko', 'PESEL'])).level1,
    );
  });

  it('keeps consecutive paragraphs as content, not repeated rows', () => {
    expect(fp('- paragraph: Ala\n- paragraph: Ola').level1).not.toBe(
      fp('- paragraph: Ala\n- paragraph: Ela').level1,
    );
  });

  it('gives equal subtrees equal signatures and different roles different ones', () => {
    const [a, b, c] = tree('- listitem: a\n- listitem: b\n- paragraph: c');
    expect(a!.signature).toBe(b!.signature);
    expect(a!.signature).not.toBe(c!.signature);
  });
});

describe('element keys (spec 039 design § 5.5)', () => {
  const form = [
    '- main:',
    '  - form "Dane pojazdu":',
    '    - textbox "Model"',
    '    - button "Oblicz składkę"',
  ].join('\n');

  it('role | masked lower-cased name | container path | ordinal', () => {
    expect(modelElementKeys(tree(form)).map((k) => k.key)).toEqual([
      'textbox|model|main>form "Dane pojazdu"|',
      'button|oblicz składkę|main>form "Dane pojazdu"|',
    ]);
  });

  it('adds the nearest heading above inside the container', () => {
    const keys = modelElementKeys(
      tree('- main:\n  - heading "Twoje dane" [level=2]\n  - button "Dalej"'),
    );
    expect(keys[0]!.key).toBe('button|dalej|main>heading "Twoje dane"|');
  });

  it('numbers elements only when role, name and container repeat', () => {
    const keys = modelElementKeys(
      tree('- main:\n  - link "Więcej"\n  - link "Więcej"\n  - link "FAQ"'),
    );
    expect(keys.map((k) => k.key)).toEqual([
      'link|więcej|main|1',
      'link|więcej|main|2',
      'link|faq|main|',
    ]);
    expect(keys.map((k) => k.nth)).toEqual([0, 1, 0]);
  });

  it('masks numbers in names, so a counter does not change the key', () => {
    const a = modelElementKeys(tree('- banner:\n  - link "Koszyk (3)"'))[0]!.key;
    const b = modelElementKeys(tree('- banner:\n  - link "Koszyk (4)"'))[0]!.key;
    expect(a).toBe(b);
  });

  it('matches extracted actions to keys by role, masked name and order; others fall back', () => {
    const keys = modelElementKeys(
      tree('- main:\n  - link "Polisa 12"\n  - link "Polisa 13"\n  - button "Dalej"'),
    );
    expect(
      keysForActions(keys, [
        { role: 'link', maskedName: 'Polisa <n>', nth: 0 },
        { role: 'link', maskedName: 'Polisa <n>', nth: 0 },
        { role: 'button', maskedName: 'Dalej', nth: 0 },
        { role: 'generic', maskedName: 'Ikona', nth: 0, frame: 'f1' },
      ]),
    ).toEqual([
      'link|polisa <n>|main|1',
      'link|polisa <n>|main|2',
      'button|dalej|main|',
      'generic|ikona|f1|0',
    ]);
  });

  it('skips the options of a native select, as the action extractor does', () => {
    const keys = modelElementKeys(
      tree('- combobox "Marka":\n  - option "Skoda"\n  - option "Audi"'),
    );
    expect(keys.map((k) => k.role)).toEqual(['combobox']);
  });
});

describe('state components', () => {
  it('hashes calls and mounts as sets and keeps 128 MinHash values', () => {
    const a = computeComponents({
      routeTemplate: '/x',
      ariaSnapshot: drivers(2),
      calls: ['GET /api/b', 'GET /api/a', 'GET /api/a'],
      mounts: ['quote-mfe'],
    });
    const b = computeComponents({
      routeTemplate: '/x',
      ariaSnapshot: drivers(3),
      calls: ['GET /api/a', 'GET /api/b'],
      mounts: ['quote-mfe'],
    });
    expect(a.callsHash).toBe(b.callsHash);
    expect(a.structureHash).toBe(b.structureHash);
    expect(a.minhash).toHaveLength(128);
    expect(minhashBlob(a.minhash)).toHaveLength(512);
    expect(a.elementKeys).toHaveLength(5);
  });
});
