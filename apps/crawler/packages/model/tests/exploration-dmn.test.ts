import { describe, expect, it } from 'vitest';
import {
  explorationBound,
  explorationGaps,
  feel,
  randomWalks,
  toDmnXml,
  type DecisionTable,
} from '../src/index.js';

describe('stopping rule (design § 14.2)', () => {
  const classes = [
    { id: 'c1', screen: 'S1', leadsTo: 'S2' },
    { id: 'c2', screen: 'S2', leadsTo: null },
    { id: 'c3', screen: 'S2', leadsTo: 'S3' },
  ];

  it('lists what depth 1 and depth 2 still miss', () => {
    const gaps = explorationGaps(
      classes,
      ['guest'],
      new Set(['guest\u0000c1', 'guest\u0000c3']),
      new Set(['c1\u0000c3']),
    );
    expect(gaps.depth1).toEqual(['guest\u0000c2']);
    expect(gaps.depth2).toEqual(['c1\u0000c2']);
  });

  it('walks inside the process, the same walks for the same seed (T075)', () => {
    const loop = [...classes, { id: 'c4', screen: 'S2', leadsTo: 'S1' }];
    const members = new Set(['S1', 'S2']);
    const walks = randomWalks(loop, 'S1', members, { walks: 5, length: 4, seed: 7 });
    expect(walks).toHaveLength(5);
    // c3 leads out of the process and c2 nowhere: only c1 and c4 are taken, in turn.
    for (const w of walks) expect(w).toEqual(['c1', 'c4', 'c1', 'c4']);
    expect(randomWalks(loop, 'S1', members, { walks: 5, length: 4, seed: 7 })).toEqual(walks);
    expect(randomWalks(classes, 'S3', members, { walks: 3, length: 4, seed: 1 })).toEqual([]);
  });

  it('states the bound the documentation carries', () => {
    expect(
      explorationBound({
        depth: 2,
        randomWalks: 50,
        builds: ['quote-mfe 9c21', 'shell 3e1a'],
        newDeviations: 0,
      }),
    ).toBe(
      'Explored to depth 2 plus 50 random walks on builds quote-mfe 9c21, shell 3e1a; no counterexamples.',
    );
  });
});

describe('DMN export (design § 11.4)', () => {
  it('writes FEEL unary tests', () => {
    expect(feel('< 18')).toBe('< 18');
    expect(feel('= premium')).toBe('"premium"');
    expect(feel('in [a, b]')).toBe('"a","b"');
    expect(feel('>= 18 and < 21')).toBe('[18..21[');
    expect(feel(undefined)).toBe('-');
  });

  it('writes a DMN 1.3 decision table with one rule row per rule', () => {
    const table: DecisionTable = {
      decisionPoint: { screen: 'SC-0012', action: 'button|oblicz składkę|main|' },
      hitPolicy: 'U',
      inputs: [{ name: 'derived.age_years', type: 'number' }],
      outputs: [{ name: 'next', type: 'screen' }],
      rules: [
        { when: { 'derived.age_years': '< 18' }, then: 'SC-0040 ok' },
        { when: { 'derived.age_years': '>= 18' }, then: 'SC-0014 ok' },
      ],
      fitness: 1,
      precision: 1,
      rows: 56,
    };
    const xml = toDmnXml(table, 'Wiek kierowcy');
    expect(xml).toContain('xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"');
    expect(xml).toContain('hitPolicy="UNIQUE"');
    expect(xml.match(/<rule /g)).toHaveLength(2);
    expect(xml).toContain('<inputEntry><text>&lt; 18</text></inputEntry>');
  });
});
