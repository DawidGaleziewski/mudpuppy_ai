import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { DocKind, RelationType } from '@mudpuppy/docs-model';
import { migrateDown, migrateUp, openDb, type OpenedDb } from '@mudpuppy/store';
import { isAllowed } from '../src/relations.js';

const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));

let opened: OpenedDb | undefined;
afterEach(async () => {
  await opened?.close();
  opened = undefined;
});

/** One record with one revision per kind; returns kind -> { record id, revision id }. */
function seed(o: OpenedDb): Record<string, { record: string; revision: string }> {
  const ts = '2026-01-01T00:00:00.000Z';
  o.raw
    .prepare(
      `INSERT INTO analysis_sessions (id, portal_id, status, passes_json, started_at) VALUES ('s', 'p', 'running', '[]', ?)`,
    )
    .run(ts);
  const out: Record<string, { record: string; revision: string }> = {};
  // A PROC record documents its process (0036, spec 039 T070).
  o.raw
    .prepare(
      `INSERT INTO ba_processes (id, portal_id, key, name, persona, stage, rev, source, created_at, updated_at)
       VALUES ('prc', 'p', 'PRC-001', 't', 'guest', 'scoped', 1, 'new', ?, ?)`,
    )
    .run(ts, ts);
  DocKind.options.forEach((kind, i) => {
    const record = `rec-${kind}`;
    const revision = `rev-${kind}`;
    o.raw
      .prepare(
        `INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, created_at, updated_at, process_id)
         VALUES (?, 'p', ?, ?, ?, 't', 1, ?, ?, ?)`,
      )
      .run(record, kind, `K${i}-001`, 1, ts, ts, kind === 'process' ? 'prc' : null);
    o.raw
      .prepare(
        `INSERT INTO doc_revisions (id, record_id, rev_no, session_id, change, content_json, confidence, status, created_at)
         VALUES (?, ?, 1, 's', 'create', '{}', 'observed', 'draft', ?)`,
      )
      .run(revision, record, ts);
    out[kind] = { record, revision };
  });
  return out;
}

/** Drop the seeded api_endpoint record (0044's down refuses while one exists). */
const dropApiEndpoint = (o: OpenedDb) => {
  o.raw.prepare("DELETE FROM doc_revisions WHERE record_id = 'rec-api_endpoint'").run();
  o.raw.prepare("DELETE FROM doc_records WHERE id = 'rec-api_endpoint'").run();
};

const insert = (o: OpenedDb, revision: string, to: string, type: string) =>
  o.raw
    .prepare('INSERT INTO doc_relations (from_revision_id, to_record_id, type) VALUES (?, ?, ?)')
    .run(revision, to, type);

describe('doc_relations triple triggers (0013_relation_triples) match RELATION_RULES', () => {
  it('store accepts exactly the triples isAllowed accepts, for every (kind, type, kind)', () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const ids = seed(opened);
    let allowed = 0;
    let refused = 0;
    for (const from of DocKind.options)
      for (const type of RelationType.options)
        for (const to of DocKind.options) {
          const attempt = () => insert(opened!, ids[from]!.revision, ids[to]!.record, type);
          if (isAllowed(from, type, to).ok) {
            expect(attempt, `${from} ${type} ${to}`).not.toThrow();
            allowed++;
          } else {
            expect(attempt, `${from} ${type} ${to}`).toThrow(/RELATION_NOT_ALLOWED/);
            refused++;
          }
        }
    expect(allowed).toBeGreaterThan(20);
    expect(refused).toBeGreaterThan(allowed);
    expect(opened.raw.prepare('SELECT count(*) AS n FROM doc_relations').get()).toEqual({
      n: allowed,
    });
  });

  it('refuses the three intents of F-12 and an UPDATE into a bad triple', () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const ids = seed(opened);
    const rev = (k: string) => ids[k]!.revision;
    const rec = (k: string) => ids[k]!.record;
    expect(() => insert(opened!, rev('business_rule'), rec('screen'), 'appears_on')).toThrow(
      /RELATION_NOT_ALLOWED/,
    );
    expect(() => insert(opened!, rev('open_question'), rec('business_rule'), 'depends_on')).toThrow(
      /RELATION_NOT_ALLOWED/,
    );
    expect(() => insert(opened!, rev('followup'), rec('process'), 'depends_on')).toThrow(
      /RELATION_NOT_ALLOWED/,
    );
    insert(opened, rev('data_item'), rec('screen'), 'appears_on');
    expect(() =>
      opened!.raw
        .prepare(`UPDATE doc_relations SET to_record_id = ? WHERE type = 'appears_on'`)
        .run(rec('process')),
    ).toThrow(/RELATION_NOT_ALLOWED/);
  });

  it('0019 down drops only the two R-51 triples and refuses them again', () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const ids = seed(opened);
    const rev = (k: string) => ids[k]!.revision;
    const rec = (k: string) => ids[k]!.record;
    insert(opened, rev('glossary_term'), rec('screen'), 'appears_on');
    insert(opened, rev('process'), rec('screen'), 'contains');
    insert(opened, rev('data_item'), rec('screen'), 'appears_on');
    insert(opened, rev('capability'), rec('screen'), 'contains');
    dropApiEndpoint(opened);
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0051');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0050');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0049');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0048');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0047');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0046');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0045');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0044');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0043');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0042');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0041');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0040');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0039');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0038');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0037');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0036');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0035');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0034');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0033');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0032');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0031');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0030');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0029');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0028');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0027');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0026');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0025');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0024');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0023');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0022');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0021');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0020');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0019');
    const left = opened.raw
      .prepare('SELECT from_revision_id AS f, type FROM doc_relations ORDER BY f')
      .all();
    expect(left).toEqual([
      { f: rev('capability'), type: 'contains' },
      { f: rev('data_item'), type: 'appears_on' },
    ]);
    expect(() => insert(opened!, rev('glossary_term'), rec('screen'), 'appears_on')).toThrow(
      /RELATION_NOT_ALLOWED/,
    );
    expect(() => insert(opened!, rev('process'), rec('screen'), 'contains')).toThrow(
      /RELATION_NOT_ALLOWED/,
    );
  });

  it('0020 down drops only assumption|use_case depends_on business_rule (spec 029)', () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const ids = seed(opened);
    const rev = (k: string) => ids[k]!.revision;
    const rec = (k: string) => ids[k]!.record;
    insert(opened, rev('assumption'), rec('business_rule'), 'depends_on');
    insert(opened, rev('use_case'), rec('business_rule'), 'depends_on');
    insert(opened, rev('process'), rec('process'), 'depends_on');
    dropApiEndpoint(opened);
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0051');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0050');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0049');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0048');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0047');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0046');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0045');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0044');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0043');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0042');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0041');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0040');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0039');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0038');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0037');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0036');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0035');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0034');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0033');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0032');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0031');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0030');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0029');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0028');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0027');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0026');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0025');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0024');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0023');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0022');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0021');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0020');
    expect(opened.raw.prepare('SELECT from_revision_id AS f FROM doc_relations').all()).toEqual([
      { f: rev('process') },
    ]);
    expect(() => insert(opened!, rev('assumption'), rec('business_rule'), 'depends_on')).toThrow(
      /RELATION_NOT_ALLOWED/,
    );
  });

  it('leaves a missing revision or record to the foreign keys', () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const ids = seed(opened);
    expect(() => insert(opened!, 'no-such-rev', ids.screen!.record, 'appears_on')).toThrow(
      /FOREIGN KEY/,
    );
  });
});

describe('0044 api_endpoint kind (spec 038 FR-008)', () => {
  it('accepts the two new triples; down refuses while an api_endpoint exists, then restores the 0043 triggers', () => {
    opened = openDb(':memory:');
    migrateUp(opened.raw, MIGRATIONS);
    const ids = seed(opened);
    const rev = (k: string) => ids[k]!.revision;
    const rec = (k: string) => ids[k]!.record;
    insert(opened, rev('api_endpoint'), rec('screen'), 'appears_on');
    insert(opened, rev('process'), rec('api_endpoint'), 'depends_on');
    insert(opened, rev('use_case'), rec('api_endpoint'), 'depends_on');
    insert(opened, rev('requirement'), rec('api_endpoint'), 'depends_on');
    expect(() => insert(opened!, rev('api_endpoint'), rec('process'), 'depends_on')).toThrow(
      /RELATION_NOT_ALLOWED/,
    );
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0051');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0050');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0049');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0048');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0047');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0046');
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0045');
    // Refused: the old CHECK cannot hold the kind, the transaction rolls back and the head stays 0044.
    expect(() => migrateDown(opened!.raw, MIGRATIONS)).toThrow(/CHECK constraint failed/);
    expect(
      opened.raw.prepare("SELECT count(*) AS n FROM doc_records WHERE kind = 'api_endpoint'").get(),
    ).toEqual({ n: 1 });
    expect(opened.raw.prepare('SELECT count(*) AS n FROM doc_relations').get()).toEqual({ n: 4 });
    // Without the api_endpoint rows the down runs and the 0020 triggers refuse the new triples again.
    opened.raw.prepare('DELETE FROM doc_relations').run();
    dropApiEndpoint(opened);
    expect(migrateDown(opened.raw, MIGRATIONS)).toBe('0044');
    expect(() => insert(opened!, rev('process'), rec('screen'), 'depends_on')).toThrow(
      /RELATION_NOT_ALLOWED/,
    );
    expect(() =>
      opened!.raw
        .prepare(
          `INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, created_at, updated_at)
           VALUES ('x', 'p', 'api_endpoint', 'API-001', 1, 't', 1, 't', 't')`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);
    migrateUp(opened.raw, MIGRATIONS);
  });
});
