import { describe, expect, it } from 'vitest';
import { CONTENT, layerBCounts, seedReview, startBa, type BaHarness } from './ba-harness.js';

const stateEvidence = (h: BaHarness) => [{ target_kind: 'state', target_id: h.fx.states.vehicle }];

/** A create_record call that succeeds unless a field is overridden. */
const create = (h: BaHarness, session_id: string, over: Record<string, unknown> = {}) => ({
  session_id,
  kind: 'requirement',
  content: CONTENT.requirement,
  confidence: 'observed',
  evidence: [
    { target_kind: 'form', target_id: h.fx.forms.vehicle, note: 'pattern on kod_pocztowy' },
  ],
  ...over,
});

describe('create_record', () => {
  it('allocates keys per kind and stores revision 1 as a draft', async () => {
    const h = await startBa();
    const s = await h.session();
    expect(await h.must('create_record', create(h, s))).toEqual({ key: 'REQ-001', rev_no: 1 });
    expect((await h.must('create_record', create(h, s))).key).toBe('REQ-002');
    expect(
      (
        await h.must(
          'create_record',
          create(h, s, { kind: 'glossary_term', content: CONTENT.glossary_term }),
        )
      ).key,
    ).toBe('GL-001');

    const record = await h.must('get_record', { portal_id: h.fx.portalId, key: 'REQ-001' });
    expect(record).toMatchObject({
      key: 'REQ-001',
      kind: 'requirement',
      title: 'Reject invalid postcode',
      latest_rev: 1,
      confirmed_rev: null,
      withdrawn: false,
    });
    expect(record.revisions).toHaveLength(1);
    expect(record.revisions[0]).toMatchObject({
      rev_no: 1,
      change: 'create',
      status: 'draft',
      confidence: 'observed',
      not_observable: false,
      session_id: s,
      content: { kind: 'requirement', ...CONTENT.requirement },
      evidence: [
        {
          target_kind: 'form',
          target_id: h.fx.forms.vehicle,
          run_id: h.fx.runId,
          note: 'pattern on kod_pocztowy',
        },
      ],
    });
  });

  it('keeps keys of another portal apart', async () => {
    const h = await startBa();
    const s = await h.session();
    await h.must('create_record', create(h, s));
    const other = (
      await h.must('start_session', { portal_id: h.fx.otherPortalId, run_ids: [h.fx.otherRunId] })
    ).session_id;
    const out = await h.must(
      'create_record',
      create(h, other, { evidence: [{ target_kind: 'state', target_id: h.fx.otherState }] }),
    );
    expect(out.key).toBe('REQ-001');
  });

  it('refuses empty or missing evidence (MISSING_EVIDENCE)', async () => {
    const h = await startBa();
    const s = await h.session();
    expect((await h.refused('create_record', create(h, s, { evidence: [] }))).code).toBe(
      'MISSING_EVIDENCE',
    );
    expect(layerBCounts(h.fx).doc_records).toBe(0);
  });

  it('refuses observed when only a rule candidate is cited (INVALID_CONFIDENCE)', async () => {
    const h = await startBa();
    const s = await h.session();
    const candidate = [{ target_kind: 'rule_candidate', target_id: h.fx.ruleCandidate }];
    const error = await h.refused(
      'create_record',
      create(h, s, { kind: 'business_rule', content: CONTENT.business_rule, evidence: candidate }),
    );
    expect(error.code).toBe('INVALID_CONFIDENCE');
    expect(error.checked).toEqual([
      {
        target_kind: 'rule_candidate',
        target_id: h.fx.ruleCandidate,
        confidence: 'inferred',
        qualifies: false,
      },
    ]);
    // The same evidence is fine for an inference.
    const ok = await h.must(
      'create_record',
      create(h, s, {
        kind: 'business_rule',
        content: CONTENT.business_rule,
        evidence: candidate,
        confidence: 'inferred',
      }),
    );
    expect(ok.key).toBe('BR-001');
    // A confidence outside the enum is a schema error.
    expect((await h.refused('create_record', create(h, s, { confidence: 'certain' }))).code).toBe(
      'SCHEMA_INVALID',
    );
  });

  it('refuses evidence from a run outside the session (RUN_NOT_IN_SESSION)', async () => {
    const h = await startBa();
    const s = await h.session();
    const later = h.fx.addRun();
    const error = await h.refused(
      'create_record',
      create(h, s, { evidence: [{ target_kind: 'edge', target_id: later.edgeId }] }),
    );
    expect(error).toMatchObject({ code: 'RUN_NOT_IN_SESSION', run_id: later.runId });
  });

  it('refuses unknown evidence (UNKNOWN_REF) and evidence of another portal (PORTAL_MISMATCH)', async () => {
    const h = await startBa();
    const s = await h.session();
    expect(
      (
        await h.refused(
          'create_record',
          create(h, s, { evidence: [{ target_kind: 'form', target_id: 'nope' }] }),
        )
      ).code,
    ).toBe('UNKNOWN_REF');
    expect(
      (
        await h.refused(
          'create_record',
          create(h, s, { evidence: [{ target_kind: 'state', target_id: h.fx.otherState }] }),
        )
      ).code,
    ).toBe('PORTAL_MISMATCH');
  });

  it('refuses content that does not fit the kind (SCHEMA_INVALID), naming the field', async () => {
    const h = await startBa();
    const s = await h.session();
    const bad = await h.refused(
      'create_record',
      create(h, s, { content: { ...CONTENT.requirement, priority: 'urgent' } }),
    );
    expect(bad.code).toBe('SCHEMA_INVALID');
    expect(bad.message).toContain('content.priority');

    const missing = await h.refused(
      'create_record',
      create(h, s, {
        content: { title: 'No statement', acceptance_criteria: [], priority: 'unset' },
      }),
    );
    expect(missing.message).toContain('content.statement');

    // A misspelt field is refused, not silently dropped.
    const typo = await h.refused(
      'create_record',
      create(h, s, { content: { ...CONTENT.requirement, rational: 'because' } }),
    );
    expect(typo.code).toBe('SCHEMA_INVALID');

    for (const over of [
      { kind: 'epic' },
      { content: { ...CONTENT.requirement, kind: 'screen' } },
      { evidence: [{ target_kind: 'screenshot', target_id: 'x' }] },
      { evidence: [{ target_kind: 'form', target_id: h.fx.forms.vehicle, status: 'confirmed' }] },
    ])
      expect((await h.refused('create_record', create(h, s, over))).code).toBe('SCHEMA_INVALID');
    expect(layerBCounts(h.fx).doc_records).toBe(0);
  });

  it('refuses prose carrying personal data (PII_SUSPECTED)', async () => {
    const h = await startBa();
    const s = await h.session();
    const error = await h.refused(
      'create_record',
      create(h, s, {
        content: {
          ...CONTENT.requirement,
          statement: 'The system shall send the quote to jan.kowalski@example.com.',
        },
      }),
    );
    expect(error).toMatchObject({ code: 'PII_SUSPECTED', field: 'content.statement' });
    const note = await h.refused(
      'create_record',
      create(h, s, {
        evidence: [
          { target_kind: 'form', target_id: h.fx.forms.vehicle, note: 'call +48 601 234 567' },
        ],
      }),
    );
    expect(note.code).toBe('PII_SUSPECTED');
    expect(layerBCounts(h.fx).doc_records).toBe(0);
  });

  it('lets a data item name the form it was seen in by id', async () => {
    const h = await startBa();
    const s = await h.session();
    const out = await h.must(
      'create_record',
      create(h, s, {
        kind: 'data_item',
        content: {
          title: 'Kod pocztowy',
          name_verbatim: 'Kod pocztowy',
          lang: 'pl',
          name_en: 'Postal code',
          data_type: 'text',
          constraints: { required: true, format: 'NN-NNN', pattern_observed: '[0-9]{2}-[0-9]{3}' },
          seen_in: [{ kind: 'form', target_id: h.fx.forms.vehicle }],
        },
      }),
    );
    expect(out.key).toBe('DI-001');
  });

  it('creates a follow-up task row, open, for kind followup', async () => {
    const h = await startBa();
    const s = await h.session();
    const { key } = await h.must(
      'create_record',
      create(h, s, {
        kind: 'followup',
        content: CONTENT.followup,
        confidence: 'needs_confirmation',
        evidence: [{ target_kind: 'open_question', target_id: h.fx.openQuestions[0] }],
      }),
    );
    expect(key).toBe('FUP-001');
    expect(
      h.fx.raw.prepare('SELECT status, run_id, blocked_reason FROM followup_tasks').all(),
    ).toEqual([{ status: 'open', run_id: null, blocked_reason: null }]);
    const record = await h.must('get_record', { portal_id: h.fx.portalId, key });
    expect(record.followup).toMatchObject({ status: 'open' });
    // No other kind gets a task row.
    await h.must('create_record', create(h, s));
    expect(layerBCounts(h.fx).followup_tasks).toBe(1);
  });
});

describe('relations', () => {
  it('stores allowed relations and refuses the rest (RELATION_NOT_ALLOWED)', async () => {
    const h = await startBa();
    const s = await h.session();
    await h.must(
      'create_record',
      create(h, s, { kind: 'business_rule', content: CONTENT.business_rule }),
    );
    await h.must(
      'create_record',
      create(h, s, { kind: 'glossary_term', content: CONTENT.glossary_term }),
    );
    await h.must(
      'create_record',
      create(h, s, {
        relations: [
          { type: 'enforces', to_key: 'BR-001' },
          { type: 'uses_term', to_key: 'GL-001' },
          { type: 'uses_term', to_key: 'GL-001' },
        ],
      }),
    );
    const record = await h.must('get_record', { portal_id: h.fx.portalId, key: 'REQ-001' });
    expect(record.revisions[0].relations).toEqual([
      { type: 'enforces', to_key: 'BR-001', to_kind: 'business_rule', to_title: 'Postcode format' },
      { type: 'uses_term', to_key: 'GL-001', to_kind: 'glossary_term', to_title: 'Autocasco (AC)' },
    ]);
    const rule = await h.must('get_record', { portal_id: h.fx.portalId, key: 'BR-001' });
    expect(rule.related_from).toEqual([
      {
        type: 'enforces',
        from_key: 'REQ-001',
        from_kind: 'requirement',
        from_title: 'Reject invalid postcode',
      },
    ]);

    const before = layerBCounts(h.fx);
    const error = await h.refused(
      'create_record',
      create(h, s, { relations: [{ type: 'contains', to_key: 'BR-001' }] }),
    );
    expect(error).toMatchObject({
      code: 'RELATION_NOT_ALLOWED',
      from_kind: 'requirement',
      type: 'contains',
      to_kind: 'business_rule',
    });
    expect(
      (
        await h.refused(
          'create_record',
          create(h, s, { relations: [{ type: 'enforces', to_key: 'BR-404' }] }),
        )
      ).code,
    ).toBe('RECORD_NOT_FOUND');
    expect(layerBCounts(h.fx)).toEqual(before);
  });
});

describe('not_observable', () => {
  it('needs a question (NOT_OBSERVABLE_NEEDS_QUESTION)', async () => {
    const h = await startBa();
    const s = await h.session();
    const hidden = {
      kind: 'business_rule',
      content: {
        title: 'Purchase confirmation',
        statement: 'What follows "Kup polisę" is not observable for a guest on production.',
        rule_type: 'action_enabler',
      },
      confidence: 'needs_confirmation',
      not_observable: true,
    };
    const action = { target_kind: 'action', target_id: h.fx.actions.buy };
    expect(
      (await h.refused('create_record', create(h, s, { ...hidden, evidence: [action] }))).code,
    ).toBe('NOT_OBSERVABLE_NEEDS_QUESTION');

    // 1. a crawler open question in the evidence
    await h.must(
      'create_record',
      create(h, s, {
        ...hidden,
        evidence: [action, { target_kind: 'open_question', target_id: h.fx.openQuestions[1] }],
      }),
    );
    // 2. an open_question record: related to, or cited
    const oq = await h.must(
      'create_record',
      create(h, s, {
        kind: 'open_question',
        content: CONTENT.open_question,
        confidence: 'needs_confirmation',
        not_observable: true,
        evidence: [action],
      }),
    );
    expect(oq.key).toBe('OQ-001');
    await h.must(
      'create_record',
      create(h, s, {
        ...hidden,
        evidence: [action],
        relations: [{ type: 'answers', to_key: 'OQ-001' }],
      }),
    );
    await h.must(
      'create_record',
      create(h, s, {
        ...hidden,
        evidence: [action, { target_kind: 'doc_record', target_id: 'OQ-001' }],
      }),
    );
    const stored = await h.must('list_records', {
      portal_id: h.fx.portalId,
      kind: 'business_rule',
    });
    expect(stored.records.map((r: { not_observable: boolean }) => r.not_observable)).toEqual([
      true,
      true,
      true,
    ]);
  });
});

describe('revise_record', () => {
  it('writes a new draft and supersedes the previous one', async () => {
    const h = await startBa();
    const s = await h.session();
    await h.must('create_record', create(h, s));
    const out = await h.must('revise_record', {
      session_id: s,
      key: 'REQ-001',
      base_rev: 1,
      content: { ...CONTENT.requirement, title: 'Reject a malformed postcode' },
      confidence: 'inferred',
      evidence: stateEvidence(h),
      change_note: 'Clearer title.',
    });
    expect(out).toEqual({ key: 'REQ-001', rev_no: 2 });
    const record = await h.must('get_record', { portal_id: h.fx.portalId, key: 'REQ-001' });
    expect(record).toMatchObject({ title: 'Reject a malformed postcode', latest_rev: 2 });
    expect(record.revisions.map((r: { status: string }) => r.status)).toEqual([
      'superseded',
      'draft',
    ]);
    expect(record.revisions[1]).toMatchObject({
      change: 'revise',
      change_note: 'Clearer title.',
      confidence: 'inferred',
      evidence: [{ target_kind: 'state', target_id: h.fx.states.vehicle, run_id: h.fx.runId }],
    });
  });

  it('refuses a stale base_rev (STALE_REVISION) with the latest revision', async () => {
    const h = await startBa();
    const s = await h.session();
    await h.must('create_record', create(h, s));
    const revise = {
      session_id: s,
      key: 'REQ-001',
      base_rev: 1,
      content: CONTENT.requirement,
      confidence: 'observed',
      evidence: stateEvidence(h),
      change_note: 'Second pass.',
    };
    await h.must('revise_record', revise);
    const before = layerBCounts(h.fx);
    expect(await h.refused('revise_record', revise)).toMatchObject({
      code: 'STALE_REVISION',
      latest_rev: 2,
    });
    expect(layerBCounts(h.fx)).toEqual(before);
  });

  it('requires a change_note, evidence, and an existing key', async () => {
    const h = await startBa();
    const s = await h.session();
    await h.must('create_record', create(h, s));
    const revise = {
      session_id: s,
      key: 'REQ-001',
      base_rev: 1,
      content: CONTENT.requirement,
      confidence: 'observed',
      evidence: stateEvidence(h),
      change_note: 'x',
    };
    expect((await h.refused('revise_record', { ...revise, change_note: '  ' })).code).toBe(
      'SCHEMA_INVALID',
    );
    expect((await h.refused('revise_record', { ...revise, evidence: [] })).code).toBe(
      'MISSING_EVIDENCE',
    );
    expect((await h.refused('revise_record', { ...revise, key: 'REQ-404' })).code).toBe(
      'RECORD_NOT_FOUND',
    );
    // The content must still fit the record's kind.
    expect((await h.refused('revise_record', { ...revise, content: CONTENT.screen })).code).toBe(
      'SCHEMA_INVALID',
    );
  });

  it('answers a rejection with responds_to_review; the confirmed baseline stays', async () => {
    const h = await startBa();
    const s = await h.session();
    await h.must('create_record', create(h, s));
    seedReview(h.fx, 'REQ-001', 1, 'confirm');
    const revise = {
      session_id: s,
      key: 'REQ-001',
      content: CONTENT.requirement,
      confidence: 'observed',
      evidence: stateEvidence(h),
    };
    await h.must('revise_record', { ...revise, base_rev: 1, change_note: 'Tightened.' });
    const reject = seedReview(h.fx, 'REQ-001', 2, 'reject', 'The format is NN-NNN, say so.');

    expect(
      (
        await h.refused('revise_record', {
          ...revise,
          base_rev: 2,
          change_note: 'x',
          responds_to_review: 'no-such-review',
        })
      ).code,
    ).toBe('UNKNOWN_REF');

    await h.must('revise_record', {
      ...revise,
      base_rev: 2,
      change_note: 'States the format as the reviewer asked.',
      responds_to_review: reject,
    });
    const record = await h.must('get_record', { portal_id: h.fx.portalId, key: 'REQ-001' });
    expect(record.revisions.map((r: { status: string }) => r.status)).toEqual([
      'confirmed',
      'rejected',
      'draft',
    ]);
    expect(record).toMatchObject({ latest_rev: 3, confirmed_rev: 1 });
    expect(record.revisions[2].responds_to_review).toBe(reject);
    expect(record.revisions[1].reviews).toMatchObject([
      { review_id: reject, action: 'reject', text: 'The format is NN-NNN, say so.' },
    ]);
  });
});

describe('withdraw_record', () => {
  it('writes a withdraw revision with the last content and marks the record withdrawn', async () => {
    const h = await startBa();
    const s = await h.session();
    await h.must('create_record', create(h, s));
    const out = await h.must('withdraw_record', {
      session_id: s,
      key: 'REQ-001',
      base_rev: 1,
      change_note: 'Duplicate of the postcode rule.',
      evidence: stateEvidence(h),
    });
    expect(out).toEqual({ key: 'REQ-001', rev_no: 2 });
    const record = await h.must('get_record', { portal_id: h.fx.portalId, key: 'REQ-001' });
    expect(record.withdrawn).toBe(true);
    expect(record.revisions[1]).toMatchObject({
      change: 'withdraw',
      status: 'draft',
      change_note: 'Duplicate of the postcode rule.',
      content: record.revisions[0].content,
    });

    // Hidden from the default listing, and its key is never given out again.
    expect((await h.must('list_records', { portal_id: h.fx.portalId })).records).toEqual([]);
    expect(
      (await h.must('list_records', { portal_id: h.fx.portalId, include_withdrawn: true })).records,
    ).toHaveLength(1);
    expect((await h.must('create_record', create(h, s))).key).toBe('REQ-002');
  });

  it('refuses a stale base_rev, missing evidence, a missing note and a second withdraw', async () => {
    const h = await startBa();
    const s = await h.session();
    await h.must('create_record', create(h, s));
    const withdraw = {
      session_id: s,
      key: 'REQ-001',
      base_rev: 1,
      change_note: 'Wrong.',
      evidence: stateEvidence(h),
    };
    expect((await h.refused('withdraw_record', { ...withdraw, base_rev: 3 })).code).toBe(
      'STALE_REVISION',
    );
    expect((await h.refused('withdraw_record', { ...withdraw, evidence: [] })).code).toBe(
      'MISSING_EVIDENCE',
    );
    expect((await h.refused('withdraw_record', { ...withdraw, change_note: '' })).code).toBe(
      'SCHEMA_INVALID',
    );
    await h.must('withdraw_record', withdraw);
    expect((await h.refused('withdraw_record', { ...withdraw, base_rev: 2 })).code).toBe(
      'SCHEMA_INVALID',
    );
  });
});

describe('address_crawler_question', () => {
  const questionStatus = (h: BaHarness, id: string) =>
    (
      h.fx.raw.prepare('SELECT status FROM open_questions WHERE id = ?').get(id) as {
        status: string;
      }
    ).status;

  it('marks the crawler question addressed only when the record’s latest revision cites it', async () => {
    const h = await startBa();
    const s = await h.session();
    const [q1, q2] = h.fx.openQuestions;
    await h.must(
      'create_record',
      create(h, s, {
        kind: 'followup',
        content: CONTENT.followup,
        confidence: 'needs_confirmation',
        evidence: [{ target_kind: 'open_question', target_id: q1 }],
      }),
    );
    const address = { session_id: s, by_key: 'FUP-001' };

    const uncited = await h.refused('address_crawler_question', {
      ...address,
      open_question_id: q2,
    });
    expect(uncited.code).toBe('MISSING_EVIDENCE');
    expect(questionStatus(h, q2)).toBe('open');

    expect(await h.must('address_crawler_question', { ...address, open_question_id: q1 })).toEqual({
      open_question_id: q1,
      status: 'addressed',
      by_key: 'FUP-001',
    });
    expect(questionStatus(h, q1)).toBe('addressed');

    // A later revision that drops the citation no longer supports it.
    await h.must('revise_record', {
      session_id: s,
      key: 'FUP-001',
      base_rev: 1,
      content: CONTENT.followup,
      confidence: 'needs_confirmation',
      evidence: [{ target_kind: 'state', target_id: h.fx.states.vehicle }],
      change_note: 'Different evidence.',
    });
    expect(
      (await h.refused('address_crawler_question', { ...address, open_question_id: q1 })).code,
    ).toBe('MISSING_EVIDENCE');
  });

  it('refuses unknown questions and records', async () => {
    const h = await startBa();
    const s = await h.session();
    expect(
      (
        await h.refused('address_crawler_question', {
          session_id: s,
          open_question_id: 'nope',
          by_key: 'FUP-001',
        })
      ).code,
    ).toBe('UNKNOWN_REF');
    expect(
      (
        await h.refused('address_crawler_question', {
          session_id: s,
          open_question_id: h.fx.openQuestions[0],
          by_key: 'FUP-001',
        })
      ).code,
    ).toBe('RECORD_NOT_FOUND');
  });
});

describe('a failed write leaves no partial rows', () => {
  it('rolls back everything when a late check fails', async () => {
    const h = await startBa();
    const s = await h.session();
    await h.must('create_record', create(h, s));
    const before = layerBCounts(h.fx);
    const records = h.fx.raw.prepare('SELECT * FROM doc_records').all();

    // Valid content and evidence; the relation check fails after they were resolved.
    await h.refused(
      'create_record',
      create(h, s, { relations: [{ type: 'refines', to_key: 'REQ-001' }] }),
    );
    await h.refused('revise_record', {
      session_id: s,
      key: 'REQ-001',
      base_rev: 1,
      content: CONTENT.requirement,
      confidence: 'observed',
      evidence: [
        { target_kind: 'state', target_id: h.fx.states.vehicle },
        { target_kind: 'form', target_id: 'nope' },
      ],
      change_note: 'x',
    });
    await h.refused(
      'create_record',
      create(h, s, { kind: 'followup', content: CONTENT.followup, not_observable: true }),
    );

    expect(layerBCounts(h.fx)).toEqual(before);
    expect(h.fx.raw.prepare('SELECT * FROM doc_records').all()).toEqual(records);
    // The key that the failed creates would have taken is still free.
    expect((await h.must('create_record', create(h, s))).key).toBe('REQ-002');
  });
});
