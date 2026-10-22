// Spec 040 T030 (design § 7 step 10): after a rebuild the miner runs on every decision point and
// its answer is imported; the miner is given, so no test tier needs Python.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  migrateUp,
  mineRules,
  openDb,
  reconcilePortalModel,
  uvMiner,
  type MinerTable,
} from '../src/index.js';
import { seedThreshold, SUBMIT, T } from './seed-threshold.js';

const MIGRATIONS = join(import.meta.dirname, '../../../../../data/migrations');
const AGE = 'derived.input.data_urodzenia.age_years';

/** What the miner answers for the seeded threshold: under 18 → the exit page. */
function stubMiner(calls: MinerTable[]) {
  return (table: MinerTable) => {
    calls.push(table);
    const target = (birth: string) =>
      table.rows.find((r) => r.features['input.data_urodzenia'] === birth)!.target;
    return {
      decisionPoint: { screen: table.decision_point.screen, action: SUBMIT },
      hitPolicy: 'U',
      inputs: [{ name: AGE, type: 'number' }],
      outputs: [{ name: 'next', type: 'screen' }],
      rules: [
        { when: { [AGE]: '< 18' }, then: target('2010-03-01') },
        { when: { [AGE]: '>= 18' }, then: target('1980-05-01') },
      ],
      fitness: 1,
      precision: 1,
      rows: table.rows.length,
    };
  };
}

describe('mining after a rebuild', () => {
  it('imports each decision point once; a second pass records nothing new', async () => {
    const o = openDb(':memory:');
    migrateUp(o.raw, MIGRATIONS);
    seedThreshold(o);
    reconcilePortalModel(o.raw, 'ins', { now: T(500) });
    const calls: MinerTable[] = [];
    const first = mineRules(o.raw, 'ins', stubMiner(calls));
    expect(first.points).toEqual([
      { where: expect.stringContaining('on SC-') as unknown, rows: 11, key: 'H-0001' },
    ]);
    expect(first.ambiguous).toEqual([]);
    expect(mineRules(o.raw, 'ins', stubMiner(calls)).points[0]!.key).toBeNull();
    expect(calls).toHaveLength(2);
    await o.close();
  });

  it('has no miner without apps/miner or when switched off', () => {
    const root = mkdtempSync(join(tmpdir(), 'pf-root-'));
    expect(uvMiner(root, {})).toBeNull();
    mkdirSync(join(root, 'apps', 'miner'), { recursive: true });
    writeFileSync(join(root, 'apps', 'miner', 'pyproject.toml'), '');
    expect(uvMiner(root, { MUDPUPPY_MINER: 'off' })).toBeNull();
  });
});
