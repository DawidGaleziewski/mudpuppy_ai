import { AnalysisPass, DocKind, KEY_PREFIX } from '@pathfinder/core';
import { applyReview, audit } from '@pathfinder/docs';
import { describe, expect, it } from 'vitest';
import { CONTENT, seedReview, startBa } from './ba-harness.js';

/**
 * A whole analysis session, the way the `ba` agent runs one: feedback first, the seven passes with
 * their records, an answer to a rejection, then finish. The audit must find nothing (SC-001, SC-002).
 */
describe('BA end to end on the fixture store', () => {
  it('documents the portal in one session and leaves an audit-clean store', async () => {
    const h = await startBa();
    const { fx, must } = h;
    const portal_id = fx.portalId;

    // --- An earlier session left one rule; a reviewer rejected it. --------------------------------
    const earlier = await h.session();
    await must('create_record', {
      session_id: earlier,
      kind: 'business_rule',
      content: {
        title: 'AC eligibility',
        statement: 'The portal offers "Autocasco (AC)" for every vehicle.',
        rule_type: 'constraint',
      },
      confidence: 'inferred',
      evidence: [{ target_kind: 'rule_candidate', target_id: fx.ruleCandidate }],
    });
    await must('record_pass', { session_id: earlier, pass: 'synthesis', summary: 'One rule.' });
    await must('finish_session', { session_id: earlier, summary: 'First look.', gaps: [] });
    const rejection = seedReview(
      fx,
      'BR-001',
      1,
      'reject',
      'The page says AC is only for vehicles up to 15 years.',
    );

    // --- The session under test -------------------------------------------------------------------
    const feedback = await must('get_pending_feedback', { portal_id });
    expect(feedback.reviews).toMatchObject([
      { review_id: rejection, action: 'reject', key: 'BR-001' },
    ]);

    const { runs } = await must('list_runs', { portal_id });
    const start = await must('start_session', {
      portal_id,
      run_ids: runs.map((r: { run_id: string }) => r.run_id),
    });
    const session_id = start.session_id as string;
    expect(start.pending_feedback).toMatchObject({ rejections: 1, unanswered: 1 });
    const create = async (args: Record<string, unknown>): Promise<string> =>
      (await must('create_record', { session_id, ...args })).key;
    const pass = (name: string, summary: string) =>
      must('record_pass', { session_id, pass: name, summary });

    // Feedback first: revise the rejected rule, answering the review.
    const rejected = await must('get_record', { portal_id, key: 'BR-001' });
    await must('revise_record', {
      session_id,
      key: 'BR-001',
      base_rev: rejected.latest_rev,
      content: {
        title: 'AC eligibility',
        statement: 'The portal offers "Autocasco (AC)" only for vehicles up to 15 years old.',
        rule_type: 'constraint',
      },
      confidence: 'observed',
      evidence: [
        { target_kind: 'state', target_id: fx.states.car, note: 'paragraph on the product page' },
        { target_kind: 'review', target_id: rejection },
      ],
      change_note: 'Corrected to the limit the page states, as the reviewer pointed out.',
      responds_to_review: rejection,
    });

    // 1. inventory
    const states = (await must('get_run_evidence', { run_id: fx.runId, kind: 'states' })).items;
    expect(states).toHaveLength(4);
    const snapshot = await must('get_evidence', {
      target_kind: 'state',
      target_id: fx.states.vehicle,
    });
    expect(snapshot.evidence.content).toContain('form "Dane pojazdu"');
    const screen = await create({
      kind: 'screen',
      content: CONTENT.screen,
      confidence: 'observed',
      evidence: [
        { target_kind: 'state', target_id: fx.states.vehicle, run_id: fx.runId },
        { target_kind: 'edge', target_id: fx.edges.carToVehicle, note: 'entry from the car page' },
      ],
    });
    await pass('inventory', 'One screen documented from four recorded states.');

    // 2. capabilities
    const capability = await create({
      kind: 'capability',
      content: {
        title: 'Car insurance quoting',
        description: 'A guest can start an OC/AC premium calculation.',
      },
      confidence: 'inferred',
      evidence: [{ target_kind: 'state', target_id: fx.states.car }],
      relations: [{ type: 'contains', to_key: screen }],
    });
    await pass('capabilities', 'One capability.');

    // 3. processes: nothing traced yet, so ask the crawler.
    const followup = await create({
      kind: 'followup',
      content: CONTENT.followup,
      confidence: 'needs_confirmation',
      evidence: [
        { target_kind: 'open_question', target_id: fx.openQuestions[0] },
        { target_kind: 'action', target_id: fx.actions.next },
      ],
    });
    await must('address_crawler_question', {
      session_id,
      open_question_id: fx.openQuestions[0],
      by_key: followup,
    });
    await pass('processes', 'No trace exists; one follow-up asks for the calculator trace.');

    // 4. rules
    const glossary = await create({
      kind: 'glossary_term',
      content: CONTENT.glossary_term,
      confidence: 'observed',
      evidence: [{ target_kind: 'state', target_id: fx.states.car }],
    });
    const rule = await create({
      kind: 'business_rule',
      content: CONTENT.business_rule,
      confidence: 'observed',
      evidence: [{ target_kind: 'form', target_id: fx.forms.vehicle, note: 'pattern attribute' }],
    });
    const requirement = await create({
      kind: 'requirement',
      content: CONTENT.requirement,
      confidence: 'observed',
      evidence: [{ target_kind: 'form', target_id: fx.forms.vehicle }],
      relations: [
        { type: 'enforces', to_key: rule },
        { type: 'refines', to_key: capability },
        { type: 'uses_term', to_key: glossary },
      ],
    });
    await pass('rules', 'One rule and the requirement that enforces it.');

    // 5. data
    const dataItem = await create({
      kind: 'data_item',
      content: {
        title: 'Kod pocztowy',
        name_verbatim: 'Kod pocztowy',
        lang: 'pl',
        name_en: 'Postal code',
        data_type: 'text',
        constraints: { required: true, format: 'NN-NNN', pattern_observed: '[0-9]{2}-[0-9]{3}' },
        seen_in: [{ kind: 'form', target_id: fx.forms.vehicle }],
      },
      confidence: 'observed',
      evidence: [{ target_kind: 'form', target_id: fx.forms.vehicle }],
      relations: [{ type: 'appears_on', to_key: screen }],
    });
    await pass('data', 'One data item, one term.');

    // 6. nfr
    const nfr = await create({
      kind: 'nfr',
      content: {
        title: 'Pages served in Polish',
        category: 'localisation',
        statement: 'The system shall serve the guest pages in Polish.',
        measured: { value: '4', unit: 'pages', how: 'labels of the four recorded states' },
      },
      confidence: 'observed',
      evidence: [
        { target_kind: 'state', target_id: fx.states.home },
        { target_kind: 'network_call', target_id: fx.networkCalls.quote },
      ],
    });
    await pass('nfr', 'One measured NFR.');

    // 7. synthesis
    const question = await create({
      kind: 'open_question',
      content: CONTENT.open_question,
      confidence: 'needs_confirmation',
      not_observable: true,
      evidence: [
        { target_kind: 'open_question', target_id: fx.openQuestions[1] },
        { target_kind: 'decision', target_id: fx.decision },
      ],
    });
    const assumption = await create({
      kind: 'assumption',
      content: {
        title: 'Purchase needs an account',
        statement: 'Buying a policy after "Kup polisę" requires a logged-in customer.',
        impact_if_wrong: 'The purchase flow would have to work for guests.',
      },
      confidence: 'needs_confirmation',
      not_observable: true,
      evidence: [{ target_kind: 'action', target_id: fx.actions.buy }],
      relations: [{ type: 'answers', to_key: question }],
    });
    await must('address_crawler_question', {
      session_id,
      open_question_id: fx.openQuestions[1],
      by_key: question,
    });
    await pass('synthesis', 'Assumption and open question recorded; links checked.');

    const finished = await must('finish_session', {
      session_id,
      summary: 'Documented the vehicle step, its rule, data and gaps.',
      gaps: ['Calculator steps after "Dalej" were not mapped; FUP-001 asks for a trace.'],
    });

    // --- What the session left behind -------------------------------------------------------------
    expect(finished).toMatchObject({ status: 'completed', records_written: 11 });
    expect(finished.passes).toEqual(AnalysisPass.options);
    expect([screen, capability, followup, glossary, rule, requirement, dataItem, nfr]).toEqual([
      'SCR-001',
      'CAP-001',
      'FUP-001',
      'GL-001',
      'BR-002',
      'REQ-001',
      'DI-001',
      'NFR-001',
    ]);
    expect([question, assumption]).toEqual(['OQ-001', 'ASM-001']);

    const { records } = await must('list_records', { portal_id });
    const kinds = new Set(records.map((r: { kind: DocKind }) => r.kind));
    for (const kind of [
      'screen',
      'capability',
      'data_item',
      'glossary_term',
      'requirement',
      'business_rule',
      'nfr',
      'assumption',
      'open_question',
      'followup',
    ] as const)
      expect(kinds.has(kind), kind).toBe(true);
    for (const r of records as { key: string; kind: DocKind; status: string }[]) {
      expect(r.key.startsWith(`${KEY_PREFIX[r.kind]}-`)).toBe(true);
      // Nothing the agent wrote is more than a draft.
      expect(r.status).toBe('draft');
    }

    const req = await must('get_record', { portal_id, key: requirement });
    expect(req.revisions[0].content.acceptance_criteria[0]).toEqual({
      given: ['the form "Dane pojazdu"'],
      when: ['"Kod pocztowy" is 123'],
      then: ['the form is not submitted'],
    });

    const answered = await must('get_record', { portal_id, key: 'BR-001' });
    expect(answered.revisions.map((r: { status: string }) => r.status)).toEqual([
      'rejected',
      'draft',
    ]);
    expect(answered.revisions[1]).toMatchObject({ responds_to_review: rejection });

    expect(fx.raw.prepare('SELECT status FROM open_questions ORDER BY id').all()).toEqual([
      { status: 'addressed' },
      { status: 'addressed' },
    ]);
    expect(await must('get_pending_feedback', { portal_id })).toMatchObject({
      reviews: [],
      followups: [],
    });

    // Every revision has evidence that resolves to its run; every status is explained.
    const report = audit(fx.raw, portal_id);
    expect(report.findings).toEqual([]);
    expect(report).toMatchObject({ ok: true, records: 11, revisions: 12 });
    expect(report.links).toBeGreaterThanOrEqual(12);
    expect(audit(fx.raw).ok).toBe(true);
  });

  it('a review written by docs:review reaches the next session; the confirmed baseline stays (US3 scenario 2)', async () => {
    const h = await startBa();
    const { fx, must } = h;
    const portal_id = fx.portalId;
    const rule = {
      title: 'AC eligibility',
      statement: 'The portal offers "Autocasco (AC)" only for vehicles up to 15 years old.',
      rule_type: 'constraint',
    };
    const evidence = [{ target_kind: 'rule_candidate', target_id: fx.ruleCandidate }];

    // Session 1 writes the rule; a reviewer confirms it (rev 1 is the baseline).
    const s1 = await h.session();
    await must('create_record', {
      session_id: s1,
      kind: 'business_rule',
      content: rule,
      confidence: 'inferred',
      evidence,
    });
    await must('record_pass', { session_id: s1, pass: 'synthesis', summary: 'One rule.' });
    await must('finish_session', { session_id: s1, summary: 'One rule.', gaps: [] });
    applyReview(fx.raw, { ...REVIEWER, portal_id, key: 'BR-001', rev_no: 1, action: 'confirm' });

    // Session 2 revises it; the reviewer rejects the new draft through the operator command.
    const s2 = await h.session();
    await must('revise_record', {
      session_id: s2,
      key: 'BR-001',
      base_rev: 1,
      content: { ...rule, statement: `${rule.statement} Older vehicles get "Tylko OC".` },
      confidence: 'inferred',
      evidence,
      change_note: 'Added what older vehicles are offered.',
    });
    await must('record_pass', { session_id: s2, pass: 'synthesis', summary: 'Revised.' });
    await must('finish_session', { session_id: s2, summary: 'Revised.', gaps: [] });
    const rejected = applyReview(fx.raw, {
      ...REVIEWER,
      portal_id,
      key: 'BR-001',
      rev_no: 2,
      action: 'reject',
      text: 'Older vehicles are not mentioned on the page.',
    });
    expect(rejected.status).toBe('rejected');

    // Session 3: the rejection is pending feedback; the BA answers it with a new draft.
    const feedback = await must('get_pending_feedback', { portal_id });
    expect(feedback.reviews).toMatchObject([
      { review_id: rejected.review_id, action: 'reject', key: 'BR-001' },
    ]);
    const s3 = await h.session();
    await must('revise_record', {
      session_id: s3,
      key: 'BR-001',
      base_rev: 2,
      content: rule,
      confidence: 'inferred',
      evidence: [...evidence, { target_kind: 'review', target_id: rejected.review_id }],
      change_note: 'Removed the unsupported sentence, as the reviewer asked.',
      responds_to_review: rejected.review_id,
    });

    const record = await must('get_record', { portal_id, key: 'BR-001' });
    expect(record.revisions.map((r: { status: string }) => r.status)).toEqual([
      'confirmed',
      'rejected',
      'draft',
    ]);
    expect(record).toMatchObject({ latest_rev: 3, confirmed_rev: 1 });
    expect(record.revisions[2]).toMatchObject({ responds_to_review: rejected.review_id });
    // Shown as answered while the answering session is still open.
    expect((await must('get_pending_feedback', { portal_id })).reviews).toMatchObject([
      { review_id: rejected.review_id, answered_by_rev: 3 },
    ]);
    expect(audit(fx.raw, portal_id).findings).toEqual([]);
  });
});

const REVIEWER = { reviewer: 'Test Reviewer' };
