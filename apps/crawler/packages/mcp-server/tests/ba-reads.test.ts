import { newId } from '@pathfinder/core';
import { FIXTURE_TS } from '@pathfinder/docs/testing';
import { describe, expect, it } from 'vitest';
import { EVIDENCE_CONTENT_LIMIT } from '../src/index.js';
import { CONTENT, seedReview, startBa, type BaHarness } from './ba-harness.js';

const requirement = (h: BaHarness, session_id: string, over: Record<string, unknown> = {}) => ({
  session_id,
  kind: 'requirement',
  content: CONTENT.requirement,
  confidence: 'observed',
  evidence: [{ target_kind: 'form', target_id: h.fx.forms.vehicle }],
  ...over,
});

describe('list_runs', () => {
  it('lists the runs of the portal with their counts', async () => {
    const h = await startBa();
    const { runs } = await h.must('list_runs', { portal_id: h.fx.portalId });
    expect(runs).toEqual([
      {
        run_id: h.fx.runId,
        mode: 'map',
        persona_id: 'guest',
        environment: 'sandbox',
        status: 'completed',
        warning: null,
        started_at: FIXTURE_TS,
        ended_at: FIXTURE_TS,
        counts: {
          states: 4,
          edges: 4,
          forms: 2,
          network_calls: 2,
          actions: 4,
          open_questions: 2,
          rule_candidates: 1,
        },
        process_name: null,
      },
    ]);
    expect((await h.must('list_runs', { portal_id: 'nobody' })).runs).toEqual([]);
  });
});

describe('get_run_evidence', () => {
  it('summarises each kind', async () => {
    const h = await startBa();
    const page = async (kind: string) =>
      (await h.must('get_run_evidence', { run_id: h.fx.runId, kind })).items;

    const states = await page('states');
    expect(states).toHaveLength(4);
    expect(states.find((s: { id: string }) => s.id === h.fx.states.vehicle)).toMatchObject({
      route_template: '/kalkulator/pojazd',
      title: expect.stringContaining('Kalkulator OC/AC'),
      confidence: 'observed',
      cluster_id: expect.any(String),
    });

    const edges = await page('edges');
    expect(edges.find((e: { id: string }) => e.id === h.fx.edges.carToVehicle)).toMatchObject({
      from_state: h.fx.states.car,
      to_state: h.fx.states.vehicle,
      from_route: '/ubezpieczenia/samochod',
      to_route: '/kalkulator/pojazd',
      status: 'executed',
      safety_class: 'read',
      action: { role: 'link', name: 'Oblicz składkę', href: '/kalkulator/pojazd' },
    });

    const actions = await page('actions');
    expect(actions.find((a: { id: string }) => a.id === h.fx.actions.buy)).toMatchObject({
      role: 'button',
      accessible_name: 'Kup polisę',
      safety_class: 'mutating',
      allowed: false,
      skip_reason: expect.stringContaining('ceiling:read'),
      form: { method: 'POST' },
    });

    const forms = await page('forms');
    const vehicle = forms.find((f: { id: string }) => f.id === h.fx.forms.vehicle);
    expect(vehicle).toMatchObject({ state_id: h.fx.states.vehicle, confidence: 'observed' });
    expect(vehicle.fields.map((f: { name: string }) => f.name)).toContain('kod_pocztowy');
    expect(vehicle.fields.find((f: { name: string }) => f.name === 'kod_pocztowy')).toMatchObject({
      required: true,
      constraints: { pattern: '[0-9]{2}-[0-9]{3}' },
    });

    expect((await page('network_calls'))[0]).toMatchObject({
      method: 'GET',
      url_template: '/api/kalkulator/marki',
      status: 200,
      res_schema: { marki: 'array<string>' },
    });
    expect((await page('open_questions')).map((q: { id: string }) => q.id)).toEqual(
      h.fx.openQuestions,
    );
    expect(await page('rule_candidates')).toMatchObject([
      { id: h.fx.ruleCandidate, confidence: 'inferred', about_ref: h.fx.states.car },
    ]);
    expect(await page('decisions')).toMatchObject([
      { id: h.fx.decision, kind: 'skip', rule: 'ceiling:read', subject_ref: h.fx.actions.buy },
    ]);
  });

  it('pages with a cursor', async () => {
    const h = await startBa();
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i++) {
      const out = await h.must('get_run_evidence', {
        run_id: h.fx.runId,
        kind: 'actions',
        limit: 3,
        ...(cursor ? { cursor } : {}),
      });
      seen.push(...out.items.map((a: { id: string }) => a.id));
      if (out.next_cursor === null) break;
      expect(out.items).toHaveLength(3);
      cursor = out.next_cursor;
    }
    expect(seen.sort()).toEqual(Object.values(h.fx.actions).sort());
    expect(new Set(seen).size).toBe(4);
  });

  it('caps the page at 200 and refuses unknown kinds and runs', async () => {
    const h = await startBa();
    const insert = h.fx.raw.prepare(
      `INSERT INTO open_questions (id, run_id, text, about_ref, status, created_at)
       VALUES (?, ?, 'q', ?, 'open', ?)`,
    );
    for (let i = 0; i < 210; i++) insert.run(newId(), h.fx.runId, h.fx.states.home, FIXTURE_TS);
    const args = { run_id: h.fx.runId, kind: 'open_questions' };

    const full = await h.must('get_run_evidence', { ...args, limit: 200 });
    expect(full.items).toHaveLength(200);
    const rest = await h.must('get_run_evidence', {
      ...args,
      limit: 200,
      cursor: full.next_cursor,
    });
    expect(rest.items).toHaveLength(12);
    expect(rest.next_cursor).toBeNull();
    expect((await h.must('get_run_evidence', args)).items).toHaveLength(50);

    expect((await h.refused('get_run_evidence', { ...args, limit: 201 })).code).toBe(
      'SCHEMA_INVALID',
    );
    expect((await h.refused('get_run_evidence', { ...args, kind: 'screens' })).code).toBe(
      'SCHEMA_INVALID',
    );
    expect((await h.refused('get_run_evidence', { ...args, run_id: 'nope' })).code).toBe(
      'RUN_NOT_FOUND',
    );
  });
});

describe('get_evidence', () => {
  it('returns the record and the content of its evidence file', async () => {
    const h = await startBa();
    const state = await h.must('get_evidence', {
      target_kind: 'state',
      target_id: h.fx.states.vehicle,
    });
    expect(state.record).toMatchObject({
      id: h.fx.states.vehicle,
      route_template: '/kalkulator/pojazd',
      observed_in_runs: [h.fx.runId],
    });
    expect(state.evidence.truncated).toBe(false);
    expect(state.evidence.content).toContain('textbox "Kod pocztowy"');
    expect(state.evidence.ref).toBe(state.record.evidence_ref);

    const form = await h.must('get_evidence', {
      target_kind: 'form',
      target_id: h.fx.forms.contact,
    });
    expect(form.record.fields_json.map((f: { name: string }) => f.name)).toContain('telefon');
    expect(form.evidence.content).toContain('form "Formularz kontaktowy"');

    // An action's evidence is the snapshot its locators came from.
    const action = await h.must('get_evidence', {
      target_kind: 'action',
      target_id: h.fx.actions.buy,
    });
    expect(action.record.action_json).toMatchObject({
      role: 'button',
      accessible_name: 'Kup polisę',
    });
    expect(action.evidence.content).toContain('button "Kup polisę"');

    // Shape-only and note records have no file.
    for (const [target_kind, target_id] of [
      ['network_call', h.fx.networkCalls.quote],
      ['open_question', h.fx.openQuestions[0]],
      ['decision', h.fx.decision],
    ] as const)
      expect((await h.must('get_evidence', { target_kind, target_id })).evidence).toBeNull();
  });

  it('truncates a large evidence file at 60 kB and says so', async () => {
    const h = await startBa();
    expect(EVIDENCE_CONTENT_LIMIT).toBe(60_000);
    const big = `- main:\n${'  - paragraph: Zażółć gęślą jaźń\n'.repeat(4000)}`;
    const ref = await h.fx.evidence.storeText(big, 'yaml');
    h.fx.raw.prepare('UPDATE states SET evidence_ref = ? WHERE id = ?').run(ref, h.fx.states.home);

    const out = await h.must('get_evidence', { target_kind: 'state', target_id: h.fx.states.home });
    expect(out.evidence.truncated).toBe(true);
    expect(out.evidence.bytes).toBe(Buffer.byteLength(big));
    expect(Buffer.byteLength(out.evidence.content)).toBeLessThanOrEqual(60_000);
    expect(Buffer.byteLength(out.evidence.content)).toBeGreaterThan(59_990);
    expect(out.evidence.content).not.toContain('�');
    expect(big.startsWith(out.evidence.content)).toBe(true);
  });

  it('reports a missing evidence file instead of failing', async () => {
    const h = await startBa();
    const gone = `${'e'.repeat(64)}.yaml`;
    h.fx.raw.prepare('UPDATE states SET evidence_ref = ? WHERE id = ?').run(gone, h.fx.states.home);
    const out = await h.must('get_evidence', { target_kind: 'state', target_id: h.fx.states.home });
    expect(out.evidence).toEqual({ ref: gone, content: null, truncated: false, bytes: 0 });
  });

  it('refuses unknown ids and kinds it does not read', async () => {
    const h = await startBa();
    expect(
      (await h.refused('get_evidence', { target_kind: 'state', target_id: 'nope' })).code,
    ).toBe('UNKNOWN_REF');
    // A form id is not a state.
    expect(
      (await h.refused('get_evidence', { target_kind: 'state', target_id: h.fx.forms.vehicle }))
        .code,
    ).toBe('UNKNOWN_REF');
    expect(
      (await h.refused('get_evidence', { target_kind: 'doc_record', target_id: 'REQ-001' })).code,
    ).toBe('SCHEMA_INVALID');
  });
});

describe('list_records and get_record', () => {
  it('filters by kind, status and withdrawn', async () => {
    const h = await startBa();
    const s = await h.session();
    await h.must('create_record', requirement(h, s));
    await h.must('create_record', requirement(h, s));
    await h.must(
      'create_record',
      requirement(h, s, {
        kind: 'glossary_term',
        content: CONTENT.glossary_term,
        confidence: 'inferred',
      }),
    );
    seedReview(h.fx, 'REQ-001', 1, 'confirm');
    await h.must('withdraw_record', {
      session_id: s,
      key: 'GL-001',
      base_rev: 1,
      change_note: 'Not a domain term.',
      evidence: [{ target_kind: 'state', target_id: h.fx.states.car }],
    });

    const list = async (filter: Record<string, unknown> = {}) =>
      (await h.must('list_records', { portal_id: h.fx.portalId, ...filter })).records;
    expect(await list()).toEqual([
      {
        key: 'REQ-001',
        kind: 'requirement',
        title: 'Reject invalid postcode',
        latest_rev: 1,
        confirmed_rev: 1,
        withdrawn: false,
        status: 'confirmed',
        confidence: 'observed',
        not_observable: false,
      },
      expect.objectContaining({ key: 'REQ-002', status: 'draft', confirmed_rev: null }),
    ]);
    expect((await list({ status: 'draft' })).map((r: { key: string }) => r.key)).toEqual([
      'REQ-002',
    ]);
    expect(await list({ kind: 'glossary_term' })).toEqual([]);
    expect(
      (await list({ kind: 'glossary_term', include_withdrawn: true })).map(
        (r: { key: string; withdrawn: boolean }) => [r.key, r.withdrawn],
      ),
    ).toEqual([['GL-001', true]]);
    expect(await list({ include_withdrawn: true })).toHaveLength(3);
    expect((await h.must('list_records', { portal_id: h.fx.otherPortalId })).records).toEqual([]);
    expect((await h.refused('list_records', { portal_id: h.fx.portalId, kind: 'epic' })).code).toBe(
      'SCHEMA_INVALID',
    );
  });

  it('returns every revision with links, relations and reviews', async () => {
    const h = await startBa();
    const s = await h.session();
    await h.must(
      'create_record',
      requirement(h, s, { kind: 'business_rule', content: CONTENT.business_rule }),
    );
    await h.must(
      'create_record',
      requirement(h, s, { relations: [{ type: 'enforces', to_key: 'BR-001' }] }),
    );
    const comment = seedReview(h.fx, 'REQ-001', 1, 'comment', 'Is the format checked on submit?');
    await h.must('revise_record', {
      session_id: s,
      key: 'REQ-001',
      base_rev: 1,
      content: CONTENT.requirement,
      confidence: 'observed',
      evidence: [
        { target_kind: 'form', target_id: h.fx.forms.vehicle, note: 'pattern attribute' },
        { target_kind: 'review', target_id: comment },
      ],
      change_note: 'Answers the reviewer.',
      responds_to_review: comment,
    });

    const record = await h.must('get_record', { portal_id: h.fx.portalId, key: 'REQ-001' });
    expect(record.revisions).toHaveLength(2);
    const [first, second] = record.revisions;
    expect(first).toMatchObject({ rev_no: 1, status: 'superseded' });
    expect(first.relations).toHaveLength(1);
    expect(first.reviews).toMatchObject([{ review_id: comment, action: 'comment' }]);
    expect(second).toMatchObject({
      rev_no: 2,
      status: 'draft',
      responds_to_review: comment,
      relations: [],
      reviews: [],
      evidence: [
        { target_kind: 'form', run_id: h.fx.runId, note: 'pattern attribute' },
        { target_kind: 'review', target_id: comment, run_id: null, note: null },
      ],
    });
    // The relation belonged to revision 1; revision 2 dropped it.
    expect(
      (await h.must('get_record', { portal_id: h.fx.portalId, key: 'BR-001' })).related_from,
    ).toEqual([]);

    expect((await h.refused('get_record', { portal_id: h.fx.portalId, key: 'REQ-404' })).code).toBe(
      'RECORD_NOT_FOUND',
    );
    expect(
      (await h.refused('get_record', { portal_id: h.fx.otherPortalId, key: 'REQ-001' })).code,
    ).toBe('RECORD_NOT_FOUND');
  });
});

describe('get_pending_feedback', () => {
  /** Finish the session `at` a given time, so "since" is under the test's control. */
  const finish = async (h: BaHarness, session_id: string, at: string) => {
    await h.must('record_pass', { session_id, pass: 'synthesis', summary: 'Done.' });
    await h.must('finish_session', { session_id, summary: 'Done.', gaps: [] });
    h.fx.raw.prepare('UPDATE analysis_sessions SET ended_at = ? WHERE id = ?').run(at, session_id);
  };

  it('returns reviews and follow-up changes newer than the previous completed session', async () => {
    const h = await startBa();
    const s1 = await h.session();
    await h.must('create_record', requirement(h, s1));
    await h.must('create_record', requirement(h, s1));
    await h.must(
      'create_record',
      requirement(h, s1, {
        kind: 'followup',
        content: CONTENT.followup,
        confidence: 'needs_confirmation',
      }),
    );
    await h.must(
      'create_record',
      requirement(h, s1, {
        kind: 'followup',
        content: CONTENT.followup,
        confidence: 'needs_confirmation',
      }),
    );
    // Reviewed while the first session was still running: seen by that session, not pending later.
    seedReview(h.fx, 'REQ-002', 1, 'comment', 'Early note.', '2026-02-01T09:00:00.000Z');

    // Before any session completed, everything is pending.
    const early = await h.must('get_pending_feedback', { portal_id: h.fx.portalId });
    expect(early.since).toBeNull();
    expect(early.reviews.map((r: { text: string }) => r.text)).toEqual(['Early note.']);

    await finish(h, s1, '2026-02-01T10:00:00.000Z');

    const reject = seedReview(
      h.fx,
      'REQ-001',
      1,
      'reject',
      'Wrong format.',
      '2026-02-02T08:00:00.000Z',
    );
    seedReview(h.fx, 'REQ-002', 1, 'confirm', null, '2026-02-02T08:05:00.000Z');
    const tasks = h.fx.raw.prepare(
      `UPDATE followup_tasks SET status = ?, run_id = ?, blocked_reason = ?, updated_at = ?
       WHERE record_id = (SELECT id FROM doc_records WHERE key = ?)`,
    );
    tasks.run('done', h.fx.runId, null, '2026-02-02T09:00:00.000Z', 'FUP-001');

    const feedback = await h.must('get_pending_feedback', { portal_id: h.fx.portalId });
    expect(feedback.since).toBe('2026-02-01T10:00:00.000Z');
    expect(feedback.reviews).toEqual([
      {
        review_id: reject,
        action: 'reject',
        reviewer: 'Test Reviewer',
        text: 'Wrong format.',
        created_at: '2026-02-02T08:00:00.000Z',
        key: 'REQ-001',
        title: 'Reject invalid postcode',
        rev_no: 1,
        revision_status: 'rejected',
        latest_rev: 1,
        answered_by_rev: null,
      },
      expect.objectContaining({ action: 'confirm', key: 'REQ-002', revision_status: 'confirmed' }),
    ]);
    // FUP-002 is still open and unchanged, so only FUP-001 is reported.
    expect(feedback.followups).toEqual([
      {
        key: 'FUP-001',
        title: 'Trace the OC/AC calculator',
        status: 'done',
        run_id: h.fx.runId,
        blocked_reason: null,
        updated_at: '2026-02-02T09:00:00.000Z',
      },
    ]);

    // The next session is told at start, and sees which reviews it has answered.
    const start = await h.must('start_session', {
      portal_id: h.fx.portalId,
      run_ids: [h.fx.runId],
    });
    expect(start.pending_feedback).toEqual({
      rejections: 1,
      comments: 0,
      confirmations: 1,
      unanswered: 1,
      followups_changed: 1,
    });
    await h.must('revise_record', {
      session_id: start.session_id,
      key: 'REQ-001',
      base_rev: 1,
      content: CONTENT.requirement,
      confidence: 'observed',
      evidence: [{ target_kind: 'form', target_id: h.fx.forms.vehicle }],
      change_note: 'Fixed the format.',
      responds_to_review: reject,
    });
    const answered = await h.must('get_pending_feedback', { portal_id: h.fx.portalId });
    expect(answered.reviews[0]).toMatchObject({
      review_id: reject,
      answered_by_rev: 2,
      latest_rev: 2,
    });

    // Once that session completes, nothing is pending any more.
    await finish(h, start.session_id, '2026-02-03T10:00:00.000Z');
    expect(await h.must('get_pending_feedback', { portal_id: h.fx.portalId })).toEqual({
      since: '2026-02-03T10:00:00.000Z',
      reviews: [],
      followups: [],
    });
  });

  it('is scoped to the portal', async () => {
    const h = await startBa();
    const s = await h.session();
    await h.must('create_record', requirement(h, s));
    seedReview(h.fx, 'REQ-001', 1, 'comment', 'Note.');
    expect(
      (await h.must('get_pending_feedback', { portal_id: h.fx.otherPortalId })).reviews,
    ).toEqual([]);
  });
});

describe('list_processes, get_process', () => {
  it('lists the trace processes of the portal with outcome, step count and boundary', async () => {
    const h = await startBa();
    expect((await h.must('list_processes', { portal_id: h.fx.portalId })).processes).toEqual([]);
    const done = h.fx.addTraceRun();
    const boundary = h.fx.addBoundaryTrace();

    const { processes } = await h.must('list_processes', { portal_id: h.fx.portalId });
    expect(processes).toEqual([
      {
        process_id: done.processId,
        run_id: done.runId,
        name: 'Calculate a car premium',
        goal: 'See an OC/AC premium for a car',
        persona_id: 'guest',
        outcome: 'goal_reached',
        step_count: 3,
        boundary_action_id: null,
      },
      {
        process_id: boundary.processId,
        run_id: boundary.runId,
        name: 'Buy a car policy',
        goal: 'Reach the purchase confirmation',
        persona_id: 'guest',
        outcome: 'boundary_reached',
        step_count: 2,
        boundary_action_id: boundary.boundaryActionId,
      },
    ]);
    expect((await h.must('list_processes', { portal_id: h.fx.otherPortalId })).processes).toEqual(
      [],
    );
  });

  it('names the process of a trace run in list_runs', async () => {
    const h = await startBa();
    const t = h.fx.addTraceRun();
    const { runs } = await h.must('list_runs', { portal_id: h.fx.portalId });
    expect(runs.find((r: { run_id: string }) => r.run_id === t.runId)).toMatchObject({
      mode: 'trace',
      process_name: 'Calculate a car premium',
    });
    expect(runs.find((r: { run_id: string }) => r.run_id === h.fx.runId).process_name).toBeNull();
  });

  it('returns the process with its ordered steps', async () => {
    const h = await startBa();
    const t = h.fx.addTraceRun();
    const p = await h.must('get_process', { process_id: t.processId });
    expect(p).toMatchObject({
      process_id: t.processId,
      run_id: t.runId,
      portal_id: h.fx.portalId,
      name: 'Calculate a car premium',
      outcome: 'goal_reached',
      boundary: null,
    });
    expect(p.observed_result).toContain('Dane pojazdu');
    expect(p.steps.map((s: { ord: number }) => s.ord)).toEqual([1, 2, 3]);
    expect(p.steps[0]).toMatchObject({
      step_id: t.stepIds[0],
      intent: 'Open the car insurance page',
      kind: 'navigate',
      action: null,
      state_before: null,
      state_after: { state_id: h.fx.states.car, route_template: '/ubezpieczenia/samochod' },
    });
    expect(p.steps[1]).toMatchObject({
      kind: 'click',
      action: { role: 'link', name: 'Oblicz składkę' },
      edge_id: t.edgeIds[1],
      state_before: { state_id: h.fx.states.car },
      state_after: { state_id: h.fx.states.vehicle, title: expect.stringContaining('Kalkulator') },
      outcomes: ['navigated to /kalkulator/pojazd'],
      confidence: 'observed',
    });
    expect(p.steps[1].evidence_ref).toEqual(expect.any(String));
    expect(p.steps[2]).toMatchObject({ kind: 'fill', value: 'Test Model', state_after: null });
  });

  it('attaches the network calls of a step through its edge', async () => {
    const h = await startBa();
    const t = h.fx.addTraceRun();
    h.fx.raw
      .prepare(
        `INSERT INTO network_calls (id, run_id, edge_id, method, url_template, status, req_schema,
         res_schema, console_errors, created_at) VALUES (?, ?, ?, 'GET', '/api/x', 200, '{}', '{}', '[]', ?)`,
      )
      .run(newId(), t.runId, t.edgeIds[1], FIXTURE_TS);
    const p = await h.must('get_process', { process_id: t.processId });
    expect(p.steps[1].network_calls).toMatchObject([{ method: 'GET', url_template: '/api/x' }]);
    expect(p.steps[0].network_calls).toEqual([]);
  });

  it('returns the boundary of a boundary trace', async () => {
    const h = await startBa();
    const t = h.fx.addBoundaryTrace();
    const p = await h.must('get_process', { process_id: t.processId });
    expect(p.outcome).toBe('boundary_reached');
    expect(p.boundary).toMatchObject({
      action_id: t.boundaryActionId,
      role: 'button',
      name: 'Dalej',
      safety_class: 'mutating',
      skip_reason: expect.stringContaining('ceiling:read'),
      not_observable: expect.stringContaining('Dalej'),
    });
  });

  it('refuses an unknown process', async () => {
    const h = await startBa();
    expect((await h.refused('get_process', { process_id: 'nope' })).code).toBe('UNKNOWN_REF');
  });
});
