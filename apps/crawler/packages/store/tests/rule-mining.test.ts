import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  importMinedRule,
  loadObservationTables,
  migrateUp,
  openDb,
  reconcilePortalModel,
  type OpenedDb,
} from '../src/index.js';
import { seedThreshold, SUBMIT, T } from './seed-threshold.js';

const MIGRATIONS = join(import.meta.dirname, '../../../../../data/migrations');

function open(): OpenedDb {
  const o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  seedThreshold(o);
  reconcilePortalModel(o.raw, 'ins', { now: T(500) });
  return o;
}

/**
 * The whole loop with the real Python miner: opt in with `PF_MINER=1` (needs `uv`), so no test
 * tier depends on Python (constitution: Python never on the crawler's path).
 */
describe.skipIf(!process.env.PF_MINER)('the real miner (PF_MINER=1)', () => {
  it('splits the outcomes inside the gap the data leaves, and imports the rule', async () => {
    const o = open();
    const [table] = loadObservationTables(o.raw, 'ins');
    const dir = mkdtempSync(join(tmpdir(), 'pf-miner-'));
    const file = join(dir, 'table.json');
    writeFileSync(file, JSON.stringify(table));
    const miner = join(import.meta.dirname, '../../../../miner');
    const out = execFileSync(
      'uv',
      ['run', '--project', miner, 'mudpuppy-miner', 'rules', '--in', file],
      {
        encoding: 'utf8',
      },
    );
    const mined = JSON.parse(out) as { rules: { when: Record<string, string> }[]; fitness: number };
    expect(mined.fitness).toBe(1);
    // No driver between 17 and 26 was seen, so the data puts the threshold anywhere in that gap
    // (the tree takes its middle); boundary tests pin it to 18 (F-18@039).
    const cut = mined.rules
      .map((r) => r.when['derived.input.data_urodzenia.age_years'])
      .find((c) => c?.startsWith('<'));
    const t = Number(cut!.replace('<', '').trim());
    expect(t).toBeGreaterThan(17);
    expect(t).toBeLessThanOrEqual(26);
    expect(importMinedRule(o.raw, 'ins', table!, mined, T(700))).toBe('H-0001');
    await o.close();
  }, 60_000);
});

describe('decision mining in the store (spec 039 design § 11)', () => {
  it("builds the submit's observation table with the driver's age", async () => {
    const o = open();
    const tables = loadObservationTables(o.raw, 'ins');
    expect(tables).toHaveLength(1);
    const t = tables[0]!;
    expect(t.decision_point.action).toBe(SUBMIT);
    expect(t.rows).toHaveLength(11);
    expect(new Set(t.rows.map((r) => r.target)).size).toBe(2);
    expect(t.types['derived.input.data_urodzenia.age_years']).toBe('number');
    const young = t.rows.find((r) => r.features['input.data_urodzenia'] === '2010-03-01')!;
    expect(young.features['derived.input.data_urodzenia.age_years']).toBe(16);
    await o.close();
  });

  it('imports a mined rule as a decision rule for a person, with boundary tests at 17, 18, 19', async () => {
    const o = open();
    const [table] = loadObservationTables(o.raw, 'ins');
    const exit = table!.rows.find(
      (r) => r.features['input.data_urodzenia'] === '2010-03-01',
    )!.target;
    const price = table!.rows.find(
      (r) => r.features['input.data_urodzenia'] === '1980-05-01',
    )!.target;
    const mined = {
      decisionPoint: { screen: table!.decision_point.screen, action: SUBMIT },
      hitPolicy: 'U',
      inputs: [{ name: 'derived.input.data_urodzenia.age_years', type: 'number' }],
      outputs: [{ name: 'next', type: 'screen' }],
      rules: [
        { when: { 'derived.input.data_urodzenia.age_years': '< 18' }, then: exit },
        { when: { 'derived.input.data_urodzenia.age_years': '>= 18' }, then: price },
      ],
      fitness: 1,
      precision: 1,
      rows: 11,
    };
    const key = importMinedRule(o.raw, 'ins', table!, mined, T(600));
    expect(key).toBe('H-0001');
    expect(importMinedRule(o.raw, 'ins', table!, mined, T(601))).toBeNull(); // recorded once
    const h = o.raw.prepare('SELECT kind, rule, derived, fitness FROM hypotheses').get();
    expect(h).toEqual({ kind: 'decision_rule', rule: 'R7', derived: 0, fitness: 1 });
    const tests = o.raw.prepare('SELECT inputs_json FROM hypothesis_tests').all() as {
      inputs_json: string;
    }[];
    const ages = tests.map(
      (t) => JSON.parse(t.inputs_json)['derived.input.data_urodzenia.age_years'],
    );
    expect(ages).toEqual([17, 18, 19]);
    expect(() => importMinedRule(o.raw, 'ins', table!, { nonsense: true })).toThrow();
    await o.close();
  });
});
