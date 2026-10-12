import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportSrs } from '../src/export.js';
import {
  makeFixtureStore,
  seedDocRecords,
  type FixtureStore,
  type SeededDocs,
} from '../src/testing/index.js';

/** Spec 019 F-14: the new links are shown on the record they point at. */
let fx: FixtureStore;
let seeded: SeededDocs;
let files: Map<string, string>;

const latestRev = (key: string): string =>
  (
    fx.raw
      .prepare(
        'SELECT v.id FROM doc_revisions v JOIN doc_records r ON r.id = v.record_id WHERE r.key = ? ORDER BY v.rev_no DESC LIMIT 1',
      )
      .get(key) as { id: string }
  ).id;
const keyOf = (kind: string): string =>
  (
    fx.raw.prepare('SELECT key FROM doc_records WHERE kind = ? ORDER BY key LIMIT 1').get(kind) as {
      key: string;
    }
  ).key;

beforeAll(async () => {
  fx = await makeFixtureStore({ portalId: 'reference-insurer', deterministicIds: true });
  seeded = seedDocRecords(fx);
  const relate = fx.raw.prepare(
    'INSERT INTO doc_relations (from_revision_id, to_record_id, type) VALUES (?, ?, ?)',
  );
  const [rule, screen, question] = [
    keyOf('business_rule'),
    keyOf('screen'),
    keyOf('open_question'),
  ];
  relate.run(latestRev(rule), seeded.ids[screen], 'applies_on');
  relate.run(latestRev(question), seeded.ids[rule], 'asks_about');
  files = exportSrs(fx.raw, fx.portalId, { environment: 'sandbox' }) as Map<string, string>;
});
afterAll(() => fx.close());

describe('SRS export: applies_on and asks_about (spec 019 F-14)', () => {
  it('lists the rules on the screen and the open question on the rule', () => {
    expect(files.get('03-screens.md')).toContain('**Business rules on this screen:**');
    expect(files.get('06-business-rules.md')).toContain('**Open questions about this:**');
    expect(files.get('06-business-rules.md')).toMatch(/Related: applies on \[SCR-/);
  });
});
