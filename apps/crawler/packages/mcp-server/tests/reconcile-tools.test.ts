import { describe, expect, it } from 'vitest';
import { startBa, type BaHarness } from './ba-harness.js';
import { DOWN_STATE, P, seedDiffering } from './differing-fixture.js';

// Spec 033 US3 (contracts/reconcile-tools.md): the BA lists the differing states with their
// evidence and proposes one verdict per outcome; a newer proposal supersedes the open one.

const CALC = 'action:home:button:Calculate';
const main = {
  state_id: 'st-quote',
  verdict: 'main',
  hypothesis: 'temporary',
  reason: '2 of 3 scans',
};
const temp = {
  state_id: DOWN_STATE,
  verdict: 'temporary',
  hypothesis: 'temporary',
  reason: '503 once',
};

async function setUp(): Promise<{ h: BaHarness; session: string }> {
  const h = await startBa();
  seedDiffering(h.fx.raw);
  const session = (
    await h.must('start_session', { portal_id: P, run_ids: ['r1', 'r2', 'r3', 'r4'] })
  ).session_id as string;
  return { h, session };
}

describe('list_differing_states and propose_verdicts (spec 033)', () => {
  it('lists the groups with the verdict and hypothesis lists, none reconciled yet', async () => {
    const { h } = await setUp();
    const out = await h.must('list_differing_states', { portal_id: P });
    expect(out.groups.map((g: { key: string }) => g.key)).toContain(CALC);
    expect(out.groups.every((g: { reconciliation: unknown }) => g.reconciliation === null)).toBe(
      true,
    );
    expect(out.verdicts).toContain('variant_persona');
    expect(out.hypotheses[0]).toBe('persona');
  });

  it('stores a proposal with the group snapshot, and a newer one supersedes it', async () => {
    const { h, session } = await setUp();
    const first = await h.must('propose_verdicts', {
      session_id: session, portal_id: P, group_key: CALC, verdicts: [main, temp],
    }); // prettier-ignore
    expect(first).toMatchObject({ status: 'proposed', superseded: null });
    const second = await h.must('propose_verdicts', {
      session_id: session, portal_id: P, group_key: CALC,
      verdicts: [main, { ...temp, verdict: 'technical' }],
    }); // prettier-ignore
    expect(second.superseded).toBe(first.id);
    const rows = h.fx.raw
      .prepare('SELECT id, status, snapshot_json FROM reconciliations ORDER BY proposed_at, id')
      .all() as { id: string; status: string; snapshot_json: string }[];
    expect(rows.map((r) => r.status).sort()).toEqual(['proposed', 'superseded']);
    expect(JSON.parse(rows[0]!.snapshot_json).key).toBe(CALC);
    const listed = await h.must('list_differing_states', { portal_id: P, route: '/' });
    const calc = listed.groups.find((g: { key: string }) => g.key === CALC);
    expect(calc.reconciliation).toMatchObject({
      id: second.id,
      status: 'proposed',
      confirmed: null,
    });
  });

  it('refuses an unknown group, a missing outcome, a verdict off the list and another portal', async () => {
    const { h, session } = await setUp();
    const base = { session_id: session, portal_id: P, group_key: CALC };
    expect(await h.refused('propose_verdicts', { ...base, group_key: 'action:x:y:z', verdicts: [main] }))
      .toMatchObject({ code: 'GROUP_UNKNOWN' }); // prettier-ignore
    expect(await h.refused('propose_verdicts', { ...base, verdicts: [main] })).toMatchObject({
      code: 'VERDICTS_INCOMPLETE',
      missing: [DOWN_STATE],
    });
    expect(
      await h.refused('propose_verdicts', {
        ...base,
        verdicts: [main, { ...temp, verdict: 'error' }],
      }),
    ).toMatchObject({ code: 'SCHEMA_INVALID' });
    expect(
      await h.refused('propose_verdicts', {
        ...base,
        portal_id: 'reference-insurer',
        verdicts: [main, temp],
      }),
    ).toMatchObject({ code: 'SCHEMA_INVALID' });
    expect(h.fx.raw.prepare('SELECT count(*) AS n FROM reconciliations').get()).toEqual({ n: 0 });
  });
});
