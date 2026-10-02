import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@pathfinder/core';
import { DocsError } from '../src/errors.js';
import { resolveTargets, type EvidenceLinkInput } from '../src/evidence.js';
import { FIXTURE_TS, makeFixtureStore, type FixtureStore } from '../src/testing/index.js';

let fx: FixtureStore;
beforeEach(async () => {
  fx = await makeFixtureStore({ portalId: 'reference-insurer' });
});
afterEach(() => fx.close());

const resolve = (links: EvidenceLinkInput[], runs = [fx.runId], portal = fx.portalId) =>
  resolveTargets(fx.raw, portal, runs, links);
const failure = (fn: () => unknown): DocsError => {
  try {
    fn();
  } catch (e) {
    if (e instanceof DocsError) return e;
    throw e;
  }
  throw new Error('expected a DocsError');
};

/** A record with one revision and one review, written directly (the tools are not under test here). */
function seedRecord(portal: string, key = 'OQ-001') {
  const sessionId = newId();
  fx.raw
    .prepare(
      `INSERT INTO analysis_sessions (id, portal_id, status, passes_json, summary, gaps_json, started_at, ended_at)
       VALUES (?, ?, 'running', '[]', NULL, '[]', ?, NULL)`,
    )
    .run(sessionId, portal, FIXTURE_TS);
  const recordId = newId();
  fx.raw
    .prepare(
      `INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev, withdrawn,
       created_at, updated_at) VALUES (?, ?, 'open_question', ?, 1, 't', 1, NULL, 0, ?, ?)`,
    )
    .run(recordId, portal, key, FIXTURE_TS, FIXTURE_TS);
  const revisionId = newId();
  fx.raw
    .prepare(
      `INSERT INTO doc_revisions (id, record_id, rev_no, session_id, change, content_json, confidence,
       not_observable, status, change_note, responds_to_review, created_at)
       VALUES (?, ?, 1, ?, 'create', '{}', 'needs_confirmation', 0, 'draft', NULL, NULL, ?)`,
    )
    .run(revisionId, recordId, sessionId, FIXTURE_TS);
  const reviewId = newId();
  fx.raw
    .prepare(
      `INSERT INTO doc_reviews (id, revision_id, action, reviewer, text, created_at)
       VALUES (?, ?, 'comment', 'Test Reviewer', 'The limit is 75.', ?)`,
    )
    .run(reviewId, revisionId, FIXTURE_TS);
  return { recordId, reviewId };
}

describe('the fixture store', () => {
  it('holds one completed map run shaped like the reference portal, and a second portal', () => {
    const count = (sql: string, ...args: string[]) =>
      (fx.raw.prepare(sql).get(...args) as { n: number }).n;
    expect(count('SELECT COUNT(*) n FROM runs WHERE portal_id = ?', fx.portalId)).toBe(1);
    expect(count('SELECT COUNT(*) n FROM state_observations WHERE run_id = ?', fx.runId)).toBe(4);
    expect(count('SELECT COUNT(*) n FROM forms WHERE run_id = ?', fx.runId)).toBe(2);
    expect(count('SELECT COUNT(*) n FROM network_calls WHERE run_id = ?', fx.runId)).toBe(2);
    expect(count('SELECT COUNT(*) n FROM open_questions WHERE run_id = ?', fx.runId)).toBe(2);
    expect(count('SELECT COUNT(*) n FROM rule_candidates WHERE run_id = ?', fx.runId)).toBe(1);
    expect(count('SELECT COUNT(*) n FROM runs WHERE portal_id = ?', fx.otherPortalId)).toBe(1);
    expect(
      fx.raw
        .prepare('SELECT accessible_name, safety_class, allowed FROM actions WHERE id = ?')
        .get(fx.actions.buy),
    ).toEqual({ accessible_name: 'Kup polisę', safety_class: 'mutating', allowed: 0 });
    expect(count('SELECT COUNT(*) n FROM doc_records')).toBe(0);
  });

  it('points every state at an evidence file that exists', async () => {
    const { readFile } = await import('node:fs/promises');
    const rows = fx.raw.prepare('SELECT evidence_ref FROM states').all() as {
      evidence_ref: string;
    }[];
    for (const r of rows)
      expect((await readFile(fx.evidence.resolve(r.evidence_ref), 'utf8')).length).toBeGreaterThan(
        0,
      );
  });
});

describe('resolveTargets', () => {
  it('resolves run-bound Layer A targets with their run, portal and confidence', () => {
    const out = resolve([
      { target_kind: 'edge', target_id: fx.edges.homeToCar },
      { target_kind: 'form', target_id: fx.forms.vehicle },
      { target_kind: 'action', target_id: fx.actions.buy },
      { target_kind: 'network_call', target_id: fx.networkCalls.quote },
      { target_kind: 'rule_candidate', target_id: fx.ruleCandidate },
      { target_kind: 'open_question', target_id: fx.openQuestions[0] },
      { target_kind: 'decision', target_id: fx.decision },
    ]);
    expect(out.map((t) => [t.target_kind, t.confidence])).toEqual([
      ['edge', 'observed'],
      ['form', 'observed'],
      ['action', 'observed'],
      ['network_call', 'observed'],
      ['rule_candidate', 'inferred'],
      ['open_question', null],
      ['decision', null],
    ]);
    for (const t of out) {
      expect(t.run_id).toBe(fx.runId);
      expect(t.portal_id).toBe(fx.portalId);
    }
    expect(out[0]!.target_id).toBe(fx.edges.homeToCar);
  });

  it('ties a state to the session run that observed it', () => {
    expect(resolve([{ target_kind: 'state', target_id: fx.states.home }])).toEqual([
      {
        target_kind: 'state',
        target_id: fx.states.home,
        run_id: fx.runId,
        portal_id: fx.portalId,
        confidence: 'observed',
      },
    ]);
  });

  it('lets a state link name the observation run, and defaults to the latest session run', () => {
    const later = fx.addRun();
    const link = { target_kind: 'state', target_id: fx.states.home } as const;
    expect(resolve([link], [fx.runId, later.runId])[0]!.run_id).toBe(later.runId);
    expect(resolve([{ ...link, run_id: fx.runId }], [fx.runId, later.runId])[0]!.run_id).toBe(
      fx.runId,
    );
  });

  it('refuses a state observation run that never saw the state (UNKNOWN_REF)', () => {
    const later = fx.addRun();
    const e = failure(() =>
      resolve(
        [{ target_kind: 'state', target_id: fx.states.contact, run_id: later.runId }],
        [fx.runId, later.runId],
      ),
    );
    expect(e.code).toBe('UNKNOWN_REF');
  });

  it('refuses evidence from a run outside the session (RUN_NOT_IN_SESSION)', () => {
    const later = fx.addRun();
    const edge = failure(() => resolve([{ target_kind: 'edge', target_id: later.edgeId }]));
    expect(edge.code).toBe('RUN_NOT_IN_SESSION');
    expect(edge.details).toMatchObject({ run_id: later.runId, index: 0 });

    const state = failure(() =>
      resolve([{ target_kind: 'state', target_id: fx.states.home, run_id: later.runId }]),
    );
    expect(state.code).toBe('RUN_NOT_IN_SESSION');

    const unseen = failure(() =>
      resolve([{ target_kind: 'state', target_id: fx.states.contact }], [later.runId]),
    );
    expect(unseen.code).toBe('RUN_NOT_IN_SESSION');
  });

  it('refuses a target that does not exist (UNKNOWN_REF), naming the link', () => {
    const e = failure(() =>
      resolve([
        { target_kind: 'form', target_id: fx.forms.contact },
        { target_kind: 'form', target_id: 'nope' },
      ]),
    );
    expect(e.code).toBe('UNKNOWN_REF');
    expect(e.details).toMatchObject({ index: 1, target_kind: 'form', target_id: 'nope' });
    // An id of the wrong kind is unknown too.
    expect(
      failure(() => resolve([{ target_kind: 'edge', target_id: fx.forms.contact }])).code,
    ).toBe('UNKNOWN_REF');
  });

  it('refuses a target of another portal (PORTAL_MISMATCH)', () => {
    const other = fx.addRun(fx.otherPortalId);
    for (const link of [
      { target_kind: 'state', target_id: fx.otherState },
      { target_kind: 'edge', target_id: other.edgeId },
    ] as const) {
      const e = failure(() => resolve([link], [fx.runId, fx.otherRunId, other.runId]));
      expect(e.code).toBe('PORTAL_MISMATCH');
      expect(e.details).toMatchObject({ portal_id: fx.otherPortalId });
    }
  });

  it('accepts run_id only on a state link', () => {
    const e = failure(() =>
      resolve([{ target_kind: 'edge', target_id: fx.edges.homeToCar, run_id: fx.runId }]),
    );
    expect(e.code).toBe('SCHEMA_INVALID');
  });

  it('resolves doc_record (by key or id) and review targets with a null run', () => {
    const { recordId, reviewId } = seedRecord(fx.portalId);
    expect(
      resolve([
        { target_kind: 'doc_record', target_id: 'OQ-001' },
        { target_kind: 'doc_record', target_id: recordId },
        { target_kind: 'review', target_id: reviewId },
      ]),
    ).toEqual([
      {
        target_kind: 'doc_record',
        target_id: recordId,
        run_id: null,
        portal_id: fx.portalId,
        confidence: null,
      },
      {
        target_kind: 'doc_record',
        target_id: recordId,
        run_id: null,
        portal_id: fx.portalId,
        confidence: null,
      },
      {
        target_kind: 'review',
        target_id: reviewId,
        run_id: null,
        portal_id: fx.portalId,
        confidence: null,
      },
    ]);
  });

  it('refuses records and reviews of another portal, and unknown keys', () => {
    const foreign = seedRecord(fx.otherPortalId);
    expect(
      failure(() => resolve([{ target_kind: 'doc_record', target_id: foreign.recordId }])).code,
    ).toBe('PORTAL_MISMATCH');
    expect(
      failure(() => resolve([{ target_kind: 'review', target_id: foreign.reviewId }])).code,
    ).toBe('PORTAL_MISMATCH');
    // The key exists only in the other portal.
    expect(failure(() => resolve([{ target_kind: 'doc_record', target_id: 'OQ-001' }])).code).toBe(
      'UNKNOWN_REF',
    );
  });

  it('defers process targets to trace mode (UNKNOWN_REF for now)', () => {
    for (const target_kind of ['process', 'process_step'] as const)
      expect(failure(() => resolve([{ target_kind, target_id: 'p1' }])).code).toBe('UNKNOWN_REF');
  });
});
