import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FixtureStore } from '@pathfinder/docs/testing';

// Spec 033 US3, research R7: a small portal with differing states, for the rule and tool tests.
// The rows and the expected groups live in one JSON file that the dashboard's Python reader is
// checked with too (`apps/dashboard/tests/test_differing.py`, the access-matrix precedent).
// - "Calculate" on the home page led to the quote form in two guest scans and to a 503 page once;
// - "My policies" led to the account page for the client and to the sign-in page for guests;
// - a probe's press from the quote form to its validation state is explained (left out);
// - /news shows two screens (an unexplained second state); /apply's two screens are form steps
//   and /p/:param's two are items of one template (both explained).

export const FIXTURE = fileURLToPath(
  new URL('../../../tests/fixtures/differing/differing-states.json', import.meta.url),
);

type Row = Record<string, unknown>;
export interface DifferingFixture {
  portal_id: string;
  rows: Record<string, Row[]>;
  expected: {
    key: string;
    kind: string;
    outcomes: {
      screen_id: string;
      state_id: string;
      state_kind: string;
      seen: number;
      of: number;
      reproduced: boolean;
      http_status: number | null;
      personas: string[];
    }[];
  }[];
}

export const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as DifferingFixture;
export const P = fixture.portal_id;
export const T = (m: number): string => `2026-10-17T10:${String(m).padStart(2, '0')}:00.000Z`;
/** A real-looking state id: live ids are UUIDs, which the PII token rule once flagged (F-07). */
export const DOWN_STATE = '01a14982-5871-7000-b599-4bfe9180655b';

const ORDER = [
  'runs',
  'form_steps',
  'screens',
  'states',
  'state_observations',
  'transitions',
  'network_calls',
  'probe_outcomes',
];

export function seedDiffering(raw: FixtureStore['raw']): void {
  for (const table of ORDER)
    for (const row of fixture.rows[table] ?? []) {
      const cols = Object.keys(row);
      raw
        .prepare(
          `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        )
        .run(...cols.map((c) => row[c]));
    }
}
