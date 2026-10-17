import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readGroundTruth } from '@pathfinder/docs';
import { makeFixtureStore, seedDocRecords, type FixtureStore } from '@pathfinder/docs/testing';
import { isCodeName, labelsIn, scoreBaShapes } from '../graders/code/ba-shapes.js';

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

describe('isCodeName (spec 026 F-05)', () => {
  it('counts snake_case and camelCase names that are not labels', () => {
    expect(isCodeName('rok_produkcji', ['Rok produkcji'])).toBe(true);
    expect(isCodeName('postalCode', [])).toBe(true);
    expect(isCodeName('Rok produkcji', ['Rok produkcji'])).toBe(false);
    expect(isCodeName('Marka', ['Marka'])).toBe(false);
    expect(isCodeName('marka', ['Marka'])).toBe(false);
    expect(isCodeName('E-mail', [])).toBe(false);
    expect(isCodeName('PESEL', [])).toBe(false);
    expect(isCodeName('nr_polisy', ['nr_polisy'])).toBe(false);
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
      data_items_code_names: 0,
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
    setContent('data_item', { name_verbatim: 'rok_produkcji' });
    expect(scoreBaShapes(fx.raw, fx.portalId, GT).data_items_code_names).toBe(1);
  });

  it('counts process steps on an error page or a state the owner confirmed as temporary (spec 033)', () => {
    const T = '2026-10-17T10:00:00.000Z';
    const state = (id: string, kind: string) =>
      fx.raw
        .prepare(
          `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title,
             evidence_ref, confidence, stabilization, first_seen_run, created_at, state_kind)
           VALUES (?, ?, ?, ?, '/quote', 'Quote', 'ev', 'observed', 'settled', ?, ?, ?)`,
        )
        .run(id, fx.portalId, `fp-${id}`, `cl-${id}`, fx.runId, T, kind);
    state('st-ok', 'main');
    state('st-500', 'technical');
    state('st-flaky', 'main');
    const step = (id: string, stateId: string) => ({
      id,
      title: id,
      route: '/quote',
      state_id: stateId,
    });
    fx.raw
      .prepare(
        `INSERT INTO ba_processes (id, portal_id, key, name, persona, stage, rev, source, scope_id,
           suggestion_id, created_at, updated_at)
         VALUES ('pr-x', ?, 'PRC-900', 'Quote', 'guest', 'as_is_documented', 1, 'new', NULL, NULL, ?, ?)`,
      )
      .run(fx.portalId, T, T);
    fx.raw
      .prepare(
        `INSERT INTO process_variants (id, process_id, label, kind, rev, branched_from_variant_id,
           branched_from_rev, created_at) VALUES ('va-x', 'pr-x', 'A', 'as_is', 1, NULL, NULL, ?)`,
      )
      .run(T);
    fx.raw
      .prepare(
        `INSERT INTO process_variant_revisions (variant_id, rev, base_rev, change, author, steps,
           note, run_id, restored_from, created_at) VALUES ('va-x', 1, NULL, 'create', 'BA', ?,
           NULL, NULL, NULL, ?)`,
      )
      .run(JSON.stringify([step('s1', 'st-ok'), step('s2', 'st-500'), step('s3', 'st-flaky')]), T);
    expect(scoreBaShapes(fx.raw, fx.portalId, GT).error_pages_as_steps).toBe(1);
    fx.raw
      .prepare(
        `INSERT INTO reconciliations (id, portal_id, group_key, group_kind, snapshot_json,
           proposal_json, proposed_by, proposed_at, status, confirmed_json, confirmed_by, confirmed_at)
         VALUES ('rc-x', ?, 'route:/quote', 'route', '{}', '[]', 'BA', ?, 'confirmed', ?, 'Owner', ?)`,
      )
      .run(fx.portalId, T, JSON.stringify([{ state_id: 'st-flaky', verdict: 'temporary' }]), T);
    expect(scoreBaShapes(fx.raw, fx.portalId, GT).error_pages_as_steps).toBe(2);
  });
});
