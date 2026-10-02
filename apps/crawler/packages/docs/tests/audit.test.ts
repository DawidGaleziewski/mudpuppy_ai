import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId, type DocKind } from '@pathfinder/core';
import { AUDIT_CHECKS, audit, type AuditCheck } from '../src/audit.js';
import { formatKey, nextSeq } from '../src/keys.js';
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
  fx.raw
    .prepare('INSERT INTO analysis_session_runs (session_id, run_id) VALUES (?, ?)')
    .run(sessionId, fx.runId);
});
afterEach(() => fx.close());

interface Link {
  target_kind: string;
  target_id: string;
  run_id: string | null;
}

/** A consistent record written directly, the way the BA tools would leave it. */
function record(kind: DocKind = 'business_rule', title = 'Postcode format') {
  const id = newId();
  const seq = nextSeq(fx.raw, fx.portalId, kind);
  const key = formatKey(kind, seq);
  fx.raw
    .prepare(
      `INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev, withdrawn,
       created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, 0, ?, ?)`,
    )
    .run(id, fx.portalId, kind, key, seq, title, FIXTURE_TS, FIXTURE_TS);
  let revNo = 0;
  const revise = (
    over: {
      status?: string;
      confidence?: string;
      change?: string;
      title?: string;
      links?: Link[];
    } = {},
  ) => {
    revNo += 1;
    const revisionId = newId();
    const change = over.change ?? (revNo === 1 ? 'create' : 'revise');
    fx.raw
      .prepare(
        `INSERT INTO doc_revisions (id, record_id, rev_no, session_id, change, content_json, confidence,
         not_observable, status, change_note, responds_to_review, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL, ?)`,
      )
      .run(
        revisionId,
        id,
        revNo,
        sessionId,
        change,
        JSON.stringify({ kind, title: over.title ?? title }),
        over.confidence ?? 'observed',
        over.status ?? 'draft',
        change === 'create' ? null : 'changed',
        FIXTURE_TS,
      );
    const links = over.links ?? [
      { target_kind: 'form', target_id: fx.forms.vehicle, run_id: fx.runId },
    ];
    for (const l of links)
      fx.raw
        .prepare(
          `INSERT INTO doc_evidence_links (id, revision_id, target_kind, target_id, run_id, note)
           VALUES (?, ?, ?, ?, ?, NULL)`,
        )
        .run(newId(), revisionId, l.target_kind, l.target_id, l.run_id);
    fx.raw
      .prepare('UPDATE doc_records SET latest_rev = ?, title = ?, withdrawn = ? WHERE id = ?')
      .run(revNo, over.title ?? title, change === 'withdraw' ? 1 : 0, id);
    return revisionId;
  };
  const review = (revisionId: string, action: 'confirm' | 'reject' | 'comment') => {
    const reviewId = newId();
    fx.raw
      .prepare(
        `INSERT INTO doc_reviews (id, revision_id, action, reviewer, text, created_at)
         VALUES (?, ?, ?, 'Test Reviewer', ?, ?)`,
      )
      .run(reviewId, revisionId, action, action === 'confirm' ? null : 'note', FIXTURE_TS);
    return reviewId;
  };
  const set = (sql: string, ...args: unknown[]) =>
    fx.raw.prepare(`UPDATE doc_records SET ${sql} WHERE id = ?`).run(...args, id);
  return { id, key, revise, review, set };
}

const checks = (portal?: string): AuditCheck[] =>
  audit(fx.raw, portal).findings.map((f) => f.check);

describe('docs audit', () => {
  it('passes an empty store and a consistent one, with counts', () => {
    expect(audit(fx.raw)).toEqual({
      portal_id: null,
      records: 0,
      revisions: 0,
      links: 0,
      ok: true,
      findings: [],
    });
    const r = record();
    r.revise({
      links: [
        { target_kind: 'state', target_id: fx.states.vehicle, run_id: fx.runId },
        { target_kind: 'form', target_id: fx.forms.vehicle, run_id: fx.runId },
      ],
    });
    expect(audit(fx.raw, fx.portalId)).toEqual({
      portal_id: fx.portalId,
      records: 1,
      revisions: 1,
      links: 2,
      ok: true,
      findings: [],
    });
  });

  it('names every check it can report', () => {
    expect(AUDIT_CHECKS).toEqual([
      'missing_evidence',
      'broken_link',
      'link_portal_mismatch',
      'link_run_mismatch',
      'observed_rule',
      'status_unexplained',
      'denormalised_mismatch',
      'followup_without_task',
    ]);
  });

  it('finds a revision without evidence', () => {
    const r = record();
    r.revise({ links: [], confidence: 'inferred' });
    expect(audit(fx.raw).findings).toEqual([
      {
        check: 'missing_evidence',
        portal_id: fx.portalId,
        key: r.key,
        rev_no: 1,
        detail: 'the revision cites no evidence',
      },
    ]);
  });

  it('finds links that do not resolve, or resolve to another portal or run', () => {
    const later = fx.addRun();
    const broken = record();
    broken.revise({
      confidence: 'inferred',
      links: [{ target_kind: 'form', target_id: 'gone', run_id: fx.runId }],
    });
    const foreign = record();
    foreign.revise({
      confidence: 'inferred',
      links: [{ target_kind: 'state', target_id: fx.otherState, run_id: fx.otherRunId }],
    });
    const wrongRun = record();
    wrongRun.revise({
      confidence: 'inferred',
      links: [{ target_kind: 'form', target_id: fx.forms.vehicle, run_id: later.runId }],
    });
    const unseen = record();
    unseen.revise({
      confidence: 'inferred',
      links: [{ target_kind: 'state', target_id: fx.states.contact, run_id: later.runId }],
    });
    expect(audit(fx.raw).findings.map((f) => [f.key, f.check])).toEqual([
      [broken.key, 'broken_link'],
      [foreign.key, 'link_portal_mismatch'],
      [wrongRun.key, 'link_run_mismatch'],
      [unseen.key, 'link_run_mismatch'],
    ]);
  });

  it('accepts record and review links, which have no run', () => {
    const question = record('open_question', 'Why 18?');
    const first = question.revise({ confidence: 'needs_confirmation' });
    const answer = question.review(first, 'comment');
    const assumption = record('assumption', 'Legal minimum');
    assumption.revise({
      confidence: 'needs_confirmation',
      links: [
        { target_kind: 'doc_record', target_id: question.id, run_id: null },
        { target_kind: 'review', target_id: answer, run_id: null },
      ],
    });
    expect(checks()).toEqual([]);
  });

  it('finds an observed revision that cites nothing observed', () => {
    const r = record();
    r.revise({
      confidence: 'observed',
      links: [{ target_kind: 'rule_candidate', target_id: fx.ruleCandidate, run_id: fx.runId }],
    });
    expect(checks()).toEqual(['observed_rule']);
    // A broken link does not count as observed evidence either.
    const b = record();
    b.revise({ links: [{ target_kind: 'form', target_id: 'gone', run_id: fx.runId }] });
    expect(checks()).toEqual(['observed_rule', 'broken_link', 'observed_rule']);
  });

  it('explains statuses by reviews and later revisions', () => {
    const r = record();
    const one = r.revise({ status: 'superseded' });
    const two = r.revise({ status: 'confirmed' });
    r.review(two, 'confirm');
    const three = r.revise({ status: 'rejected' });
    r.review(three, 'reject');
    r.revise({ status: 'draft' });
    r.review(one, 'comment');
    r.set('confirmed_rev = 2');
    expect(checks()).toEqual([]);

    // A newer confirmation supersedes the old one.
    const again = record();
    const a1 = again.revise({ status: 'superseded' });
    again.review(a1, 'confirm');
    const a2 = again.revise({ status: 'confirmed' });
    again.review(a2, 'confirm');
    again.set('confirmed_rev = 2');
    expect(checks()).toEqual([]);
  });

  it('finds a status no review explains', () => {
    const confirmed = record();
    confirmed.revise({ status: 'confirmed' });
    confirmed.set('confirmed_rev = 1');
    const rejected = record();
    rejected.revise({ status: 'rejected' });
    const staleDraft = record();
    staleDraft.revise({ status: 'draft' });
    staleDraft.revise({ status: 'draft' });
    const ignored = record();
    const rev = ignored.revise({ status: 'draft' });
    ignored.review(rev, 'confirm');
    expect(audit(fx.raw).findings.map((f) => [f.key, f.rev_no, f.check])).toEqual([
      [confirmed.key, 1, 'status_unexplained'],
      [rejected.key, 1, 'status_unexplained'],
      [staleDraft.key, 1, 'status_unexplained'],
      [ignored.key, 1, 'status_unexplained'],
    ]);
  });

  it('finds denormalised columns that drifted from the revisions', () => {
    const r = record();
    r.revise();
    r.revise({ title: 'Postcode format NN-NNN' });
    // Make revision 1 superseded so only the columns are wrong.
    fx.raw
      .prepare("UPDATE doc_revisions SET status = 'superseded' WHERE record_id = ? AND rev_no = 1")
      .run(r.id);
    expect(checks()).toEqual([]);

    r.set("latest_rev = 1, confirmed_rev = 1, title = 'Old title', withdrawn = 1");
    const details = audit(fx.raw).findings.map((f) => f.detail);
    expect(checks()).toEqual(Array(4).fill('denormalised_mismatch'));
    expect(details[0]).toBe('latest_rev is 1; the revisions give 2');
    expect(details[2]).toContain('Postcode format NN-NNN');
  });

  it('expects withdrawn to follow the latest revision', () => {
    const r = record();
    r.revise({ status: 'superseded' });
    r.revise({ change: 'withdraw' });
    expect(checks()).toEqual([]);
    r.set('withdrawn = 0');
    expect(checks()).toEqual(['denormalised_mismatch']);
  });

  it('finds a follow-up without a task row', () => {
    const f = record('followup', 'Trace the calculator');
    f.revise({ confidence: 'needs_confirmation' });
    expect(checks()).toEqual(['followup_without_task']);
    fx.raw
      .prepare(
        `INSERT INTO followup_tasks (record_id, status, run_id, blocked_reason, updated_at)
         VALUES (?, 'open', NULL, NULL, ?)`,
      )
      .run(f.id, FIXTURE_TS);
    expect(checks()).toEqual([]);
  });

  it('audits one portal when asked', () => {
    const r = record();
    r.revise({ links: [], confidence: 'inferred' });
    expect(checks(fx.portalId)).toEqual(['missing_evidence']);
    expect(audit(fx.raw, fx.otherPortalId)).toMatchObject({ records: 0, ok: true });
  });

  it('does not write', () => {
    const r = record();
    r.revise({ links: [] });
    const before = fx.raw.prepare('SELECT total_changes() AS n').get();
    audit(fx.raw);
    expect(fx.raw.prepare('SELECT total_changes() AS n').get()).toEqual(before);
  });
});
