import { describe, expect, it } from 'vitest';
import { domainOf, guardConflicts, type DecisionTable, type GuardedTable } from '../src/index.js';

// Spec 039 T064 (design § 11.6): guards intersected along the paths of decision points.

const table = (
  screen: string,
  rules: DecisionTable['rules'],
  action = 'button|Dalej',
): DecisionTable => ({
  decisionPoint: { screen, action },
  hitPolicy: 'U',
  inputs: [],
  outputs: [{ name: 'outcome', type: 'string' }],
  rules,
  fitness: 1,
  precision: 1,
  rows: 20,
});

const driver: GuardedTable = {
  key: 'H-0001',
  table: table('SC-0001', [
    { when: { age: '< 18' }, then: 'SC-0001 validation' },
    { when: { age: '>= 18' }, then: 'SC-0002 ok' },
  ]),
};

describe('domainOf', () => {
  it('reads numeric bounds, equality and lists; leaves other text alone', () => {
    expect(domainOf('< 18')).toMatchObject({ kind: 'num', hi: 18, hiIn: false });
    expect(domainOf('>= 18')).toMatchObject({ kind: 'num', lo: 18, loIn: true });
    expect(domainOf('= 5')).toMatchObject({ kind: 'num', lo: 5, hi: 5 });
    expect(domainOf('= premium')).toEqual({ kind: 'set', values: new Set(['premium']) });
    expect(domainOf('in [a, b]')).toEqual({ kind: 'set', values: new Set(['a', 'b']) });
    expect(domainOf('looks fine')).toBeNull();
  });
});

describe('guardConflicts', () => {
  it('finds a path whose guards cannot all hold (adult first, under 16 later)', () => {
    const later: GuardedTable = {
      key: 'H-0002',
      table: table('SC-0002', [
        { when: { age: '< 16' }, then: 'SC-0003 ok' },
        { when: { age: '>= 16' }, then: 'SC-0004 ok' },
      ]),
    };
    const found = guardConflicts([driver, later]);
    expect(found).toEqual([
      {
        path: [
          { rule: 'H-0001', screen: 'SC-0001', action: 'button|Dalej', to: 'SC-0002' },
          { rule: 'H-0002', screen: 'SC-0002', action: 'button|Dalej', to: 'SC-0003' },
        ],
        attributes: ['age'],
      },
    ]);
  });

  it('keeps a path one of several rules to the same screen lets through', () => {
    const later: GuardedTable = {
      key: 'H-0002',
      table: table('SC-0002', [
        { when: { age: '< 16' }, then: 'SC-0003 ok' },
        { when: { age: '>= 65' }, then: 'SC-0003 ok' },
        { when: { age: '>= 16', product: 'in [OC, AC]' }, then: 'SC-0004 ok' },
      ]),
    };
    expect(guardConflicts([driver, later])).toEqual([]);
  });

  it('meets touching bounds only when both include the value, and compares value sets', () => {
    const exact = (when: Record<string, string>): GuardedTable => ({
      key: 'H-0009',
      table: table('SC-0002', [{ when, then: 'SC-0005 ok' }]),
    });
    expect(guardConflicts([driver, exact({ age: '<= 18' })])).toEqual([]);
    expect(guardConflicts([driver, exact({ age: '< 18' })])).toHaveLength(1);
    const plan: GuardedTable = {
      key: 'H-0003',
      table: table('SC-0001', [{ when: { plan: '= basic' }, then: 'SC-0002 ok' }]),
    };
    expect(guardConflicts([plan, exact({ plan: 'in [premium]' })])[0]?.attributes).toEqual([
      'plan',
    ]);
  });

  it('never loops on a cycle and stops at the depth limit', () => {
    const back: GuardedTable = {
      key: 'H-0004',
      table: table('SC-0002', [{ when: { age: '>= 18' }, then: 'SC-0001 ok' }]),
    };
    expect(guardConflicts([driver, back])).toEqual([]);
    const later: GuardedTable = {
      key: 'H-0002',
      table: table('SC-0002', [{ when: { age: '< 16' }, then: 'SC-0003 ok' }]),
    };
    expect(guardConflicts([driver, later], 1)).toEqual([]);
  });
});
