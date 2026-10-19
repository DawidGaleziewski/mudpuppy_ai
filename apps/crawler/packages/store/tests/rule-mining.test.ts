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

const MIGRATIONS = join(import.meta.dirname, '../../../../../data/migrations');
const H = (c: string) => c.repeat(64);
const T = (s: number) =>
  `2026-10-19T01:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.000Z`;

function blob(base: number): Buffer {
  const buf = Buffer.alloc(512);
  for (let i = 0; i < 128; i++) buf.writeUInt32BE(base * 1000 + i, i * 4);
  return buf;
}

const SUBMIT = 'button|oblicz składkę|main>form "Dane kierowcy"|';

/** A form submitted ten times with different birth dates: under 18 → exit page, else → price page. */
export function seedThreshold(o: OpenedDb): void {
  const r = o.raw;
  r.prepare(
    `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser,
       config_snapshot, status, started_at) VALUES ('run1', 'ins', 'guest', 'trace', 'sandbox', '2026-10-19',
       '1280x800', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
  ).run(T(0));
  const state = (id: string, route: string, base: number, keys: string[]) => {
    r.prepare(
      `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence,
         stabilization, first_seen_run, created_at) VALUES (?, 'ins', ?, 'c', ?, ?, ?, 'observed', 'settled', 'run1', ?)`,
    ).run(id, H(id[0]!), route, id, `${H('e')}.yaml`, T(0));
    r.prepare(
      `INSERT INTO state_components (state_id, structure_hash, content_hash, overlay_hash, calls_hash, mounts_hash,
         minhash, element_keys) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, H(String(base)), H('c'), H('o'), H('a'), H('m'), blob(base), JSON.stringify(keys));
  };
  state('form', '/kalkulator/kierowca', 1, [SUBMIT]);
  state('exit', '/odmowa', 2, []);
  state('price', '/kalkulator/wynik', 3, []);
  const births = [
    '2010-03-01',
    '2009-11-30',
    '2012-01-15',
    '2011-06-01',
    '2010-12-24',
    '1980-05-01',
    '1990-07-07',
    '1975-02-02',
    '2000-09-09',
    '1985-04-04',
    '1999-12-12',
  ]; // fmt: skip
  births.forEach((birth, i) => {
    const j = `j${i}`;
    const at = 10 + i * 3;
    r.prepare(
      "INSERT INTO journeys (id, run_id, start_kind, started_at) VALUES (?, 'run1', 'entry_url', ?)",
    ).run(j, T(at));
    r.prepare(
      `INSERT INTO page_visits (id, run_id, state_id, edge_id, via, url, hops_json, created_at, journey_id, seq, result,
         context_key, flags_json) VALUES (?, 'run1', 'form', NULL, 'navigate', 'https://ins.test/kalkulator/kierowca', '[]', ?, ?, ?, 'ok', ?, '{}')`,
    ).run(`vf${i}`, T(at), j, i * 2 + 1, H('x'));
    r.prepare(
      `INSERT INTO attribute_writes (id, journey_id, seq, name, source, value_type, value_text, created_at)
       VALUES (?, ?, 1, 'input.data_urodzenia', 'input', 'date', ?, ?)`,
    ).run(`w${i}`, j, birth, T(at));
    const adult = Number(birth.slice(0, 4)) < 2008;
    r.prepare(
      `INSERT INTO edges (id, run_id, from_state, to_state, action_json, safety_class, status, evidence_ref, confidence,
         stabilization, created_at, journey_id, seq, from_visit_id, element_key, kind, result)
       VALUES (?, 'run1', 'form', ?, '{}', 'read', 'executed', ?, 'observed', 'settled', ?, ?, 2, ?, ?, 'submit', 'ok')`,
    ).run(`e${i}`, adult ? 'price' : 'exit', `${H('e')}.yaml`, T(at + 1), j, `vf${i}`, SUBMIT);
    r.prepare(
      `INSERT INTO page_visits (id, run_id, state_id, edge_id, via, url, hops_json, created_at, journey_id, seq, result,
         context_key, flags_json) VALUES (?, 'run1', ?, ?, 'action', 'https://ins.test/next', '[]', ?, ?, ?, 'ok', ?, '{}')`,
    ).run(`vn${i}`, adult ? 'price' : 'exit', `e${i}`, T(at + 2), j, i * 2 + 2, H('x'));
  });
}

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
      ['run', '--project', miner, 'pathfinder-miner', 'rules', '--in', file],
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
