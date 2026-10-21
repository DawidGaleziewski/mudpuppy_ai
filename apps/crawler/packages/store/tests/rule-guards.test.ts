import { describe, expect, it } from 'vitest';
import {
  getHypothesis,
  importMinedRule,
  loadObservationTables,
  writeGuardConflicts,
} from '../src/index.js';
import { T, withRule } from './seed-threshold.js';

// Spec 039 T064 (design § 11.6): guards intersected along the paths of decision rules.

const AGE = 'derived.input.data_urodzenia.age_years';

/** The seeded rule (adults go on) and a later rule on the adults' screen that needs `later`. */
function withLaterRule(later: string) {
  const o = withRule(18);
  const [table] = loadObservationTables(o.raw, 'ins');
  const adults = table!.rows.find((r) => r.features['input.data_urodzenia'] === '1980-05-01')!;
  const screen = adults.target.split(' ')[0]!;
  const next = { ...table!, decision_point: { ...table!.decision_point, screen } };
  importMinedRule(
    o.raw,
    'ins',
    next,
    {
      decisionPoint: { screen, action: 'button|Kup' },
      hitPolicy: 'U',
      inputs: [{ name: AGE, type: 'number' }],
      outputs: [{ name: 'next', type: 'screen' }],
      rules: [{ when: { [AGE]: later }, then: 'SC-9999 ok' }],
      fitness: 1,
      precision: 1,
      rows: 11,
    },
    T(610),
  );
  return o;
}

describe('writeGuardConflicts', () => {
  it('writes an ambiguous hypothesis citing both rules when the guards cannot all hold', async () => {
    const o = withLaterRule('< 16');
    const keys = writeGuardConflicts(o.raw, 'ins', T(700));
    expect(keys).toHaveLength(1);
    const h = getHypothesis(o.raw, 'ins', keys[0]!);
    expect(h).toMatchObject({ kind: 'ambiguous', status: 'proposed', origin: 'rule' });
    expect(h.claim).toContain(AGE);
    expect(h.evidence.map((e) => e.hypothesis).sort()).toEqual(['H-0001', 'H-0002']);
    // Written once: the same conflict is already recorded.
    expect(writeGuardConflicts(o.raw, 'ins', T(800))).toEqual([]);
    await o.close();
  });

  it('writes nothing when the guards meet', async () => {
    const o = withLaterRule('>= 21');
    expect(writeGuardConflicts(o.raw, 'ins', T(700))).toEqual([]);
    await o.close();
  });
});
