import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { startBa, type BaHarness } from './ba-harness.js';

// The fixture the dashboard's queries_access.py is checked with too (spec 024 T004/T005).
const FIXTURE = fileURLToPath(
  new URL('../../../tests/fixtures/access/three-personas.json', import.meta.url),
);
const TABLES = ['runs', 'screens', 'states', 'state_observations', 'actions'] as const;

type Row = Record<string, unknown>;
interface Fixture {
  portal_id: string;
  defaults: Record<string, Row>;
  rows: Record<(typeof TABLES)[number], Row[]>;
  expected: { screens: Row[] } & Row;
  expected_attributes: Row;
}

function seed(h: BaHarness): Fixture {
  const fx = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture;
  for (const table of TABLES)
    for (const row of fx.rows[table]) {
      const full = { ...fx.defaults[table], ...row };
      const cols = Object.keys(full);
      h.fx.raw
        .prepare(
          `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        )
        .run(...Object.values(full));
    }
  return fx;
}

describe('get_access_matrix (spec 024 US2)', () => {
  it('returns the matrix the shared fixture expects, with each persona attributes', async () => {
    const h = await startBa();
    const fx = seed(h);
    const { persona_attributes, ...matrix } = (await h.must('get_access_matrix', {
      portal_id: fx.portal_id,
    }));
    expect(matrix).toEqual(fx.expected);
    expect(persona_attributes).toEqual(fx.expected_attributes);
  });

  it('narrows to one screen and answers an unknown portal with nothing', async () => {
    const h = await startBa();
    const fx = seed(h);
    const one = (await h.must('get_access_matrix', {
      portal_id: fx.portal_id,
      screen_id: 'sc-account',
    })) as { screens: Row[] };
    expect(one.screens).toEqual([fx.expected.screens[1]]);
    expect(await h.must('get_access_matrix', { portal_id: 'nobody' })).toEqual({
      portal_id: 'nobody',
      personas: [],
      persona_attributes: {},
      screens: [],
    });
  });
});
