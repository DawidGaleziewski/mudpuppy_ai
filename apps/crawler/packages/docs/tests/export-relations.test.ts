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
  const [rule, screen, question, term, process] = [
    keyOf('business_rule'),
    keyOf('screen'),
    keyOf('open_question'),
    keyOf('glossary_term'),
    keyOf('process'),
  ];
  relate.run(latestRev(rule), seeded.ids[screen], 'applies_on');
  relate.run(latestRev(question), seeded.ids[rule], 'asks_about');
  relate.run(latestRev(term), seeded.ids[screen], 'appears_on');
  relate.run(latestRev(process), seeded.ids[screen], 'contains');
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

describe('SRS export: glossary_term appears_on and process contains screen (R-51)', () => {
  it('lists the term and the process on the screen, apart from its data items', () => {
    const screens = files.get('03-screens.md')!;
    expect(screens).toMatch(/\*\*Terms shown:\*\*\n\n- \[GL-/);
    expect(screens).toMatch(/\*\*Processes through this screen:\*\*\n\n- \[PROC-/);
    const dataItems = screens.split('**Data items shown:**').slice(1);
    for (const section of dataItems)
      expect(section.split('**Entry points:**')[0]).not.toMatch(/GL-/);
    expect(files.get('04-processes-and-use-cases.md')).toMatch(/Related: .*contains \[SCR-/);
  });
});
