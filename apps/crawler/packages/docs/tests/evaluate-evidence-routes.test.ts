import { describe, expect, it } from 'vitest';
import type { EvidenceTargetKind } from '@pathfinder/docs-model';
import { addEvidenceLink } from '@pathfinder/store';
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
          `INSERT INTO observations (id, run_id, state_id, via, url, created_at)
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
      const link = {
        run: (
          id: string,
          revisionId: string,
          kind: EvidenceTargetKind,
          target: string,
          runId: string,
          region: string | null,
        ) =>
          addEvidenceLink(
            fx.raw,
            revisionId,
            { target_kind: kind, target_id: target, run_id: runId, region },
            { link: id, ref: `ref-${id}` },
          ),
      };
      link.run(
        'l-region',
        revision_id,
        'screen_region',
        fx.states.vehicle,
        fx.runId,
        'button "Dalej"',
      );
      link.run('l-visit', revision_id, 'observation', 'visit-1', fx.runId, null);
      const req = loadEvalInput(fx.raw, fx.portalId).records.find((r) => r.key === 'REQ-001')!;
      for (const kind of ['screen_region', 'observation'])
        expect(req.evidence.find((e) => e.target_kind === kind)!.routes).toEqual([
          '/kalkulator/pojazd',
        ]);
    } finally {
      await fx.close();
    }
  });
});
