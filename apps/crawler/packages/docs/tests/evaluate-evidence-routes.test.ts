import { describe, expect, it } from 'vitest';
import { loadEvalInput } from '../src/evaluate.js';
import { makeFixtureStore, seedDocRecords } from '../src/testing/index.js';

// Spec 025 F-01: before R-39 a screen region and a page visit resolved to no route, so a rule
// citing only them never met its anchor screen and scored as missing.
describe('loadEvalInput evidence routes', () => {
  it('resolves a screen region and a page visit to their state route', async () => {
    const fx = await makeFixtureStore({ portalId: 'reference-insurer', deterministicIds: true });
    try {
      seedDocRecords(fx);
      fx.raw
        .prepare(
          `INSERT INTO page_visits (id, run_id, state_id, via, url, created_at)
           VALUES ('visit-1', ?, ?, 'navigate', 'http://127.0.0.1:4010/kalkulator/pojazd', ?)`,
        )
        .run(fx.runId, fx.states.vehicle, '2026-01-15T10:00:00.000Z');
      const { revision_id } = fx.raw
        .prepare(
          `SELECT v.id AS revision_id FROM doc_records r
           JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev
           WHERE r.key = 'REQ-001'`,
        )
        .get() as { revision_id: string };
      const link = fx.raw.prepare(
        `INSERT INTO doc_evidence_links (id, revision_id, target_kind, target_id, run_id, region)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      link.run(
        'l-region',
        revision_id,
        'screen_region',
        fx.states.vehicle,
        fx.runId,
        'button "Dalej"',
      );
      link.run('l-visit', revision_id, 'page_visit', 'visit-1', fx.runId, null);
      const req = loadEvalInput(fx.raw, fx.portalId).records.find((r) => r.key === 'REQ-001')!;
      for (const kind of ['screen_region', 'page_visit'])
        expect(req.evidence.find((e) => e.target_kind === kind)!.routes).toEqual([
          '/kalkulator/pojazd',
        ]);
    } finally {
      await fx.close();
    }
  });
});
