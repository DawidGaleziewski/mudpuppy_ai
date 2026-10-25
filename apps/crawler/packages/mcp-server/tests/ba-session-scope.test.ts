import { describe, expect, it } from 'vitest';
import { CONTENT, startBa } from './ba-harness.js';

/** Spec 080 FR-007 (R-99 (1), F-01@047): a scoped session cites only in-scope evidence. */
async function scoped() {
  const h = await startBa();
  const raw = h.fx.raw;
  raw
    .prepare(
      `INSERT INTO chat_conversations (id, portal_id, goal, created_at, updated_at)
       VALUES ('conv-1', ?, 'test', '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z')`,
    )
    .run(h.fx.portalId);
  // The calculator: the car page to the vehicle step; the home page and contact are outside.
  raw
    .prepare(
      `INSERT INTO process_scopes (id, conversation_id, portal_id, process_name, persona, start_state_id,
         end_state_id, selected_state_ids, source, created_at)
       VALUES ('scope-1', 'conv-1', ?, 'Oblicz składkę', 'guest', ?, ?, ?, 'ba_description', '2026-10-25T00:00:00.000Z')`,
    )
    .run(
      h.fx.portalId,
      h.fx.states.car,
      h.fx.states.vehicle,
      JSON.stringify([h.fx.states.car, h.fx.states.vehicle]),
    );
  const { session_id } = await h.must('start_session', {
    portal_id: h.fx.portalId,
    run_ids: [h.fx.runId],
    scope_id: 'scope-1',
  });
  const rule = (evidence: { target_kind: string; target_id: string }[]) =>
    h.call('create_record', {
      session_id,
      kind: 'business_rule',
      confidence: 'observed',
      content: CONTENT.business_rule,
      evidence,
    });
  return { h, session_id, rule };
}

describe('start_session scope_id (spec 080)', () => {
  it('refuses a network call off the scope and keeps an in-scope citation', async () => {
    const { h, rule } = await scoped();
    const off = await rule([{ target_kind: 'network_call', target_id: h.fx.networkCalls.contact }]);
    expect(off.isError).toBe(true);
    expect(off.body).toMatchObject({ error: { code: 'OUT_OF_SCOPE' } });
    const homeToCar = await rule([
      { target_kind: 'transition', target_id: h.fx.transitions.homeToCar },
    ]);
    expect(homeToCar.isError).toBe(true); // the home page is off the scope
    const ok = await rule([{ target_kind: 'form', target_id: h.fx.forms.vehicle }]);
    expect(ok.isError).toBe(false);
  });

  it('refuses an unknown scope; a session without one is not checked', async () => {
    const h = await startBa();
    const r = await h.refused('start_session', {
      portal_id: h.fx.portalId,
      run_ids: [h.fx.runId],
      scope_id: 'nope',
    });
    expect(r.code).toBe('UNKNOWN_REF');
    const id = await h.session();
    const ok = await h.call('create_record', {
      session_id: id,
      kind: 'business_rule',
      confidence: 'observed',
      content: CONTENT.business_rule,
      evidence: [{ target_kind: 'network_call', target_id: h.fx.networkCalls.contact }],
    });
    expect(ok.isError).toBe(false);
  });
});
