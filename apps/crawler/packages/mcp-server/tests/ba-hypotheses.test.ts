import { reconcilePortalModel } from '@mudpuppy/store';
import { describe, expect, it } from 'vitest';
import { startBa } from './ba-harness.js';

/** The BA's hypothesis tools over MCP (spec 039 T055), as the agent reaches them. */
describe('BA hypothesis tools (spec 039 design § 10.4)', () => {
  it('proposes with a test once the portal has a model; lists, shows and adds a test', async () => {
    const { fx, must, refused, session } = await startBa();
    const s = await session();
    const proposal = {
      session_id: s,
      portal_id: fx.portalId,
      kind: 'decision_rule',
      claim: 'Drivers under 18 cannot get a quote.',
      evidence: [{ kind: 'state', id: fx.states.vehicle }],
      tests: [
        { inputs: { 'input.Data urodzenia': '2010-07-15' }, refutes_if: { notIn: ['exit'] } },
      ],
    };
    expect((await refused('propose_hypothesis', proposal)).code).toBe('NO_MODEL');
    reconcilePortalModel(fx.raw, fx.portalId);
    expect((await refused('propose_hypothesis', { ...proposal, tests: [] })).code).toBe(
      'TEST_REQUIRED',
    );
    const { key, created } = await must('propose_hypothesis', proposal);
    expect({ key, created }).toEqual({ key: 'H-0001', created: true });
    await must('add_hypothesis_test', {
      session_id: s,
      portal_id: fx.portalId,
      key,
      test: { inputs: { 'input.Data urodzenia': '2008-07-15' }, refutes_if: { notIn: ['ok'] } },
    });
    const listed = await must('list_hypotheses', { portal_id: fx.portalId });
    expect(listed.hypotheses).toEqual([
      expect.objectContaining({ key, status: 'proposed', origin: 'agent' }),
    ]);
    const shown = await must('get_hypothesis', { portal_id: fx.portalId, key });
    expect(shown.tests).toHaveLength(2);
    expect(shown.evidence).toEqual([{ role: 'supports', state_id: fx.states.vehicle }]);
    expect((await must('list_deviations', { portal_id: fx.portalId })).deviations).toEqual([]);
    expect((await refused('get_hypothesis', { portal_id: fx.portalId, key: 'H-0099' })).code).toBe(
      'UNKNOWN_HYPOTHESIS',
    );
  });
});
