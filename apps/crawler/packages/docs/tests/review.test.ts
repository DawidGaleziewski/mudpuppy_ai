import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId, type DocKind } from '@pathfinder/core';
import { audit } from '../src/audit.js';
import { DocsError } from '../src/errors.js';
import { formatKey, nextSeq } from '../src/keys.js';
import { applyReview, cancelFollowup } from '../src/review.js';
import { FIXTURE_TS, makeFixtureStore, type FixtureStore } from '../src/testing/index.js';

let fx: FixtureStore;
let sessionId: string;
beforeEach(async () => {
  fx = await makeFixtureStore({ portalId: 'reference-insurer' });
  sessionId = newId();
  fx.raw
    .prepare(
      `INSERT INTO analysis_sessions (id, portal_id, status, passes_json, summary, gaps_json, started_at, ended_at)
       VALUES (?, ?, 'running', '[]', NULL, '[]', ?, NULL)`,
    )
    .run(sessionId, fx.portalId, FIXTURE_TS);
});
afterEach(() => fx.close());

/** A record with `revs` draft-then-superseded revisions, the way the BA tools leave it. */
function record(kind: DocKind = 'requirement', revs = 1): { id: string; key: string } {
  const id = newId();
  const seq = nextSeq(fx.raw, fx.portalId, kind);
  const key = formatKey(kind, seq);
  fx.raw
    .prepare(
      `INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev, withdrawn,
       created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'Postcode format', ?, NULL, 0, ?, ?)`,
    )
    .run(id, fx.portalId, kind, key, seq, revs, FIXTURE_TS, FIXTURE_TS);
  for (let n = 1; n <= revs; n++) {
    const revisionId = newId();
    fx.raw
      .prepare(
        `INSERT INTO doc_revisions (id, record_id, rev_no, session_id, change, content_json, confidence,
         not_observable, status, change_note, responds_to_review, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'observed', 0, ?, ?, NULL, ?)`,
      )
      .run(
        revisionId,
        id,
        n,
        sessionId,
        n === 1 ? 'create' : 'revise',
        JSON.stringify({ kind, title: 'Postcode format' }),
        n === revs ? 'draft' : 'superseded',
        n === 1 ? null : 'changed',
        FIXTURE_TS,
      );
    fx.raw
      .prepare(
        `INSERT INTO doc_evidence_links (id, revision_id, target_kind, target_id, run_id, note)
         VALUES (?, ?, 'form', ?, ?, NULL)`,
      )
      .run(newId(), revisionId, fx.forms.vehicle, fx.runId);
  }
  if (kind === 'followup')
    fx.raw
      .prepare(`INSERT INTO followup_tasks (record_id, status, updated_at) VALUES (?, 'open', ?)`)
      .run(id, FIXTURE_TS);
  return { id, key };
}

const statuses = (recordId: string) =>
  fx.raw
    .prepare('SELECT rev_no, status FROM doc_revisions WHERE record_id = ? ORDER BY rev_no')
    .all(recordId);
const columns = (recordId: string) =>
  fx.raw.prepare('SELECT latest_rev, confirmed_rev FROM doc_records WHERE id = ?').get(recordId);
const reviewCount = () =>
  (fx.raw.prepare('SELECT count(*) AS n FROM doc_reviews').get() as { n: number }).n;

function refusal(fn: () => unknown): DocsError {
  try {
    fn();
  } catch (e) {
    if (e instanceof DocsError) return e;
    throw e;
  }
  throw new Error('expected a refusal');
}

const base = { portal_id: 'reference-insurer', reviewer: 'Test Reviewer' };

describe('applyReview (docs:review, contracts/operator-cli.md)', () => {
  it('confirms the latest draft in one transaction and keeps the audit clean', () => {
    const r = record('requirement', 2);
    const out = applyReview(fx.raw, { ...base, key: r.key, rev_no: 2, action: 'confirm' });
    expect(out).toEqual({
      ok: true,
      review_id: expect.any(String),
      key: r.key,
      rev_no: 2,
      status: 'confirmed',
    });
    expect(statuses(r.id)).toEqual([
      { rev_no: 1, status: 'superseded' },
      { rev_no: 2, status: 'confirmed' },
    ]);
    expect(columns(r.id)).toEqual({ latest_rev: 2, confirmed_rev: 2 });
    const review = fx.raw.prepare('SELECT action, reviewer, text FROM doc_reviews').get();
    expect(review).toEqual({ action: 'confirm', reviewer: 'Test Reviewer', text: null });
    expect(audit(fx.raw, fx.portalId).ok).toBe(true);
  });

  it('rejects with a reason; reject and comment need text', () => {
    const r = record();
    expect(
      refusal(() => applyReview(fx.raw, { ...base, key: r.key, rev_no: 1, action: 'reject' })).code,
    ).toBe('SCHEMA_INVALID');
    expect(
      refusal(() => applyReview(fx.raw, { ...base, key: r.key, rev_no: 1, action: 'comment' }))
        .code,
    ).toBe('SCHEMA_INVALID');
    const out = applyReview(fx.raw, {
      ...base,
      key: r.key,
      rev_no: 1,
      action: 'reject',
      text: 'The postcode rule is wrong',
    });
    expect(out.status).toBe('rejected');
    expect(statuses(r.id)).toEqual([{ rev_no: 1, status: 'rejected' }]);
  });

  it('refuses a stale revision with the latest rev and status, and writes nothing', () => {
    const r = record('requirement', 2);
    const e = refusal(() =>
      applyReview(fx.raw, { ...base, key: r.key, rev_no: 1, action: 'confirm' }),
    );
    expect(e.code).toBe('STALE_REVISION');
    expect(e.details).toEqual({ latest_rev: 2, status: 'draft' });
    applyReview(fx.raw, { ...base, key: r.key, rev_no: 2, action: 'confirm' });
    const again = refusal(() =>
      applyReview(fx.raw, { ...base, key: r.key, rev_no: 2, action: 'reject', text: 'late' }),
    );
    expect(again.code).toBe('STALE_REVISION');
    expect(again.details).toEqual({ latest_rev: 2, status: 'confirmed' });
    expect(reviewCount()).toBe(1);
  });

  it('records a comment on any revision without changing a status', () => {
    const r = record('requirement', 2);
    const out = applyReview(fx.raw, {
      ...base,
      key: r.key,
      rev_no: 1,
      action: 'comment',
      text: 'Compare with the contact form',
    });
    expect(out).toMatchObject({ ok: true, rev_no: 1, status: 'superseded' });
    expect(statuses(r.id)).toEqual([
      { rev_no: 1, status: 'superseded' },
      { rev_no: 2, status: 'draft' },
    ]);
    expect(reviewCount()).toBe(1);
  });

  it('validates the input with Zod and refuses unknown records', () => {
    const r = record();
    expect(
      refusal(() =>
        applyReview(fx.raw, { ...base, reviewer: ' ', key: r.key, rev_no: 1, action: 'confirm' }),
      ).code,
    ).toBe('SCHEMA_INVALID');
    expect(
      refusal(() => applyReview(fx.raw, { ...base, key: r.key, rev_no: 1, action: 'approve' }))
        .code,
    ).toBe('SCHEMA_INVALID');
    expect(
      refusal(() => applyReview(fx.raw, { ...base, key: 'REQ-999', rev_no: 1, action: 'confirm' }))
        .code,
    ).toBe('RECORD_NOT_FOUND');
    expect(
      refusal(() => applyReview(fx.raw, { ...base, key: r.key, rev_no: 7, action: 'confirm' }))
        .code,
    ).toBe('UNKNOWN_REF');
    expect(reviewCount()).toBe(0);
  });
});

describe('cancelFollowup (docs:review --cancel-followup)', () => {
  it('cancels an open or blocked follow-up with the reason, never a done one', () => {
    const f = record('followup');
    const out = cancelFollowup(fx.raw, {
      portal_id: 'reference-insurer',
      key: f.key,
      reviewer: 'Test Reviewer',
      text: 'Not needed any more',
    });
    expect(out).toEqual({ ok: true, key: f.key, status: 'cancelled' });
    const task = fx.raw.prepare('SELECT status FROM followup_tasks WHERE record_id = ?').get(f.id);
    expect(task).toEqual({ status: 'cancelled' });

    const done = record('followup');
    fx.raw.prepare(`UPDATE followup_tasks SET status = 'done' WHERE record_id = ?`).run(done.id);
    expect(
      refusal(() =>
        cancelFollowup(fx.raw, {
          portal_id: 'reference-insurer',
          key: done.key,
          reviewer: 'R',
          text: 'x',
        }),
      ).code,
    ).toBe('NOT_CANCELLABLE');
    const req = record('requirement');
    expect(
      refusal(() =>
        cancelFollowup(fx.raw, {
          portal_id: 'reference-insurer',
          key: req.key,
          reviewer: 'R',
          text: 'x',
        }),
      ).code,
    ).toBe('SCHEMA_INVALID');
  });
});
