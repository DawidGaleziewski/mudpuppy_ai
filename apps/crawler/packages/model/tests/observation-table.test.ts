import { describe, expect, it } from 'vitest';
import {
  observationTables,
  type AttributeWrite,
  type Execution,
  type JourneyLink,
} from '../src/index.js';

const w = (
  journeyId: string,
  seq: number,
  name: string,
  valueText: string,
  valueType: AttributeWrite['valueType'] = 'date',
): AttributeWrite => ({
  journeyId,
  seq,
  name,
  source: name.startsWith('persona') ? 'persona' : 'input',
  valueType,
  valueNum: null,
  valueText,
});

describe('observation tables (design § 11.1)', () => {
  const journeys = new Map<string, JourneyLink>([
    ['j1', { id: 'j1', parentId: null, branchSeq: null }],
    ['j2', { id: 'j2', parentId: null, branchSeq: null }],
    ['j3', { id: 'j3', parentId: null, branchSeq: null }],
  ]);
  const writes = [
    w('j1', 1, 'input.data_urodzenia', '2010-05-01'),
    w('j2', 1, 'input.data_urodzenia', '1980-05-01'),
    w('j3', 1, 'input.data_urodzenia', '1990-05-01'),
    w('j1', 0, 'persona.segment', 'standard', 'enum'),
  ];
  const ex = (
    journeyId: string,
    outcome: string,
    actionClass = 'S\u0000button|dalej|main|\u0000submit',
  ): Execution => ({
    actionClass,
    journeyId,
    seq: 2,
    outcome,
    epoch: 'shell=B1',
    at: '2026-10-19T00:00:00.000Z',
  });

  it('a submit that leads to two outcomes is a decision point with derived ages', () => {
    const [t] = observationTables(
      [ex('j1', 'SC-0040 ok'), ex('j2', 'SC-0014 ok'), ex('j3', 'SC-0014 ok')],
      writes,
      journeys,
    );
    expect(t!.rows.map((r) => r.target)).toEqual(['SC-0040 ok', 'SC-0014 ok', 'SC-0014 ok']);
    expect(t!.rows[0]!.features['derived.input.data_urodzenia.age_years']).toBe(16);
    expect(t!.types['derived.input.data_urodzenia.age_years']).toBe('number');
    expect(t!.types['persona.segment']).toBe('enum');
  });

  it('an action that always leads to the same outcome is not a decision point', () => {
    expect(
      observationTables([ex('j2', 'SC-0014 ok'), ex('j3', 'SC-0014 ok')], writes, journeys),
    ).toEqual([]);
  });
});
