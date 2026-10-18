import { describe, expect, it } from 'vitest';
import {
  LifecycleError,
  boundaryTests,
  claimHash,
  mayConfirm,
  outcomesFor,
  statusOf,
  type DecisionTable,
  type HypothesisEvent,
} from '../src/index.js';

const ev = (to: HypothesisEvent['to'], reason = 'why'): HypothesisEvent => ({
  to,
  actor: 'reconciler',
  reason,
  at: '2026-10-19T00:00:00.000Z',
});

describe('hypothesis lifecycle (design § 10.2)', () => {
  it('derives the status from events', () => {
    expect(statusOf([ev('proposed'), ev('testing'), ev('supported'), ev('confirmed')])).toBe(
      'confirmed',
    );
    expect(statusOf([ev('confirmed'), ev('superseded')])).toBe('superseded');
  });

  it('refutation and rejection are final; every move needs a reason', () => {
    expect(() => statusOf([ev('proposed'), ev('testing'), ev('refuted'), ev('confirmed')])).toThrow(
      LifecycleError,
    );
    expect(() => statusOf([ev('proposed', '  ')])).toThrow(/reason/);
    expect(() => statusOf([ev('superseded')])).toThrow(/starts/);
  });

  it('the reconciler confirms derived kinds only; agents never confirm; people always may', () => {
    expect(mayConfirm('structural_drift', 'reconciler', true)).toBe(true);
    expect(mayConfirm('ab_test', 'reconciler', true)).toBe(false);
    expect(mayConfirm('decision_rule', 'agent')).toBe(false);
    expect(mayConfirm('ab_test', 'person')).toBe(true);
  });

  it('hashes equal claims alike whatever their key order, so a refuted claim is refused', () => {
    expect(claimHash('same_as', { b: 2, a: 1 })).toBe(claimHash('same_as', { a: 1, b: 2 }));
    expect(claimHash('same_as', { a: 1 })).not.toBe(claimHash('different_from', { a: 1 }));
  });
});

describe('decision tables and boundary tests (design § 11.4–11.5)', () => {
  const table: DecisionTable = {
    decisionPoint: { screen: 'SC-0012', action: 'button|oblicz składkę|main|' },
    hitPolicy: 'U',
    inputs: [
      { name: 'derived.driver_birth_date.age_years', type: 'number' },
      { name: 'persona.segment', type: 'enum' },
    ],
    outputs: [{ name: 'next', type: 'screen' }],
    rules: [
      { when: { 'derived.driver_birth_date.age_years': '< 18' }, then: 'SC-0040 ok' },
      {
        when: { 'derived.driver_birth_date.age_years': '>= 18', 'persona.segment': '= premium' },
        then: 'SC-0015 ok',
      },
      {
        when: { 'derived.driver_birth_date.age_years': '>= 18', 'persona.segment': '= standard' },
        then: 'SC-0014 ok',
      },
    ],
    fitness: 0.98,
    precision: 1,
    rows: 42,
  };

  it('evaluates the table for a row of inputs', () => {
    expect(
      outcomesFor(table, {
        'derived.driver_birth_date.age_years': 17,
        'persona.segment': 'standard',
      }),
    ).toEqual(['SC-0040 ok']);
    expect(
      outcomesFor(table, {
        'derived.driver_birth_date.age_years': 30,
        'persona.segment': 'premium',
      }),
    ).toEqual(['SC-0015 ok']);
  });

  it('Threshold rule: tests at 17, 18 and 19, plus one per segment seen', () => {
    const tests = boundaryTests(
      table,
      { 'derived.driver_birth_date.age_years': 40, 'persona.segment': 'standard' },
      { 'persona.segment': ['standard', 'premium'] },
    );
    const ages = tests.map((t) => t.inputs['derived.driver_birth_date.age_years']);
    expect(ages.slice(0, 3)).toEqual([17, 18, 19]);
    expect(tests[0]).toMatchObject({ expect: 'SC-0040 ok', refutesIf: { notIn: ['SC-0040 ok'] } });
    expect(tests[1]).toMatchObject({ expect: 'SC-0014 ok' });
    expect(
      tests.some((t) => t.inputs['persona.segment'] === 'premium' && t.expect === 'SC-0015 ok'),
    ).toBe(true);
  });
});
