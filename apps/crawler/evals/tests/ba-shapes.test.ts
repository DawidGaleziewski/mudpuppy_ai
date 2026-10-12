import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readGroundTruth } from '@pathfinder/docs';
import { makeFixtureStore, seedDocRecords, type FixtureStore } from '@pathfinder/docs/testing';
import { labelsIn, scoreBaShapes } from '../graders/code/ba-shapes.js';

const GT = readGroundTruth(
  new URL('../../packages/reference-portal/ground-truth.yaml', import.meta.url).pathname,
);

describe('labelsIn (spec 019 F-13)', () => {
  it('finds every ground-truth label a joined data item name holds', () => {
    expect(
      labelsIn('Imię, Temat, Wiadomość, Telefon, E-mail', ['Imię', 'Temat', 'Kod pocztowy']),
    ).toEqual(['Imię', 'Temat']);
    expect(labelsIn('Kod pocztowy', ['Imię', 'Kod pocztowy'])).toEqual(['Kod pocztowy']);
  });
});

describe('scoreBaShapes (spec 019 F-09/F-13/F-14)', () => {
  let fx: FixtureStore;
  beforeAll(async () => {
    fx = await makeFixtureStore({ portalId: 'reference-insurer', deterministicIds: true });
    seedDocRecords(fx);
  });
  afterAll(() => fx.close());

  it('reads 0 on clean records, then counts a query route, a joined item and a rule on a screen', () => {
    expect(scoreBaShapes(fx.raw, fx.portalId, GT)).toMatchObject({
      route_templates_with_query: 0,
      data_items_joined: 0,
    });
    const latest = (kind: string) =>
      fx.raw
        .prepare(
          `SELECT r.id AS record, v.id AS rev, v.content_json FROM doc_records r
           JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev
           WHERE r.kind = ? ORDER BY r.key LIMIT 1`,
        )
        .get(kind) as { record: string; rev: string; content_json: string };
    const setContent = (kind: string, patch: object) => {
      const r = latest(kind);
      fx.raw
        .prepare('UPDATE doc_revisions SET content_json = ? WHERE id = ?')
        .run(JSON.stringify({ ...JSON.parse(r.content_json), ...patch }), r.rev);
    };
    setContent('screen', { route_templates: ['/porownanie/wynik?produkt_1={code}'] });
    setContent('data_item', { name_verbatim: 'Imię, Temat, Wiadomość' });
    const rule = latest('business_rule');
    fx.raw
      .prepare('INSERT INTO doc_relations (from_revision_id, to_record_id, type) VALUES (?, ?, ?)')
      .run(rule.rev, latest('screen').record, 'applies_on');
    const s = scoreBaShapes(fx.raw, fx.portalId, GT);
    expect(s.route_templates_with_query).toBe(1);
    expect(s.data_items_joined).toBe(1);
    expect(s.rules_on_screens_pct).toBeGreaterThan(0);
  });
});
