import { describe, expect, it } from 'vitest';
import { PORTAL_TABLES, where } from '../src/portal-tables.js';

// Characterisation lock (spec 042 T014, G-29): the clause that picks a portal's rows of each
// table, for its own rows and for every other portal's.
describe('where', () => {
  it('names the same rows for every portal table', () => {
    const clauses = Object.fromEntries(
      PORTAL_TABLES.map((t) => [t, { mine: where(t, 'mine'), others: where(t, 'others') }]),
    );
    expect(clauses).toMatchSnapshot();
  });
});
