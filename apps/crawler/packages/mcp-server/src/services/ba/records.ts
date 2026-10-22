import { newId, nowIso, type Confidence } from '@mudpuppy/core';
import type { DocContent, DocKind, RevisionChange } from '@mudpuppy/docs-model';
import { insertEvidenceRef } from '@mudpuppy/store';
import {
  applyStatusEvent,
  elementKeysReader,
  formatKey,
  nextSeq,
  resolveTargets,
  type ResolvedTarget,
  type StatusResult,
} from '@mudpuppy/docs';
import type { z } from 'zod';
import type { BaContext } from '../../context.js';
import { ToolError, parseInput } from '../../errors.js';
import {
  assertNoPii,
  inTransaction,
  requireActiveSession,
  sessionRunIds,
  type SessionRow,
} from './common.js';
import {
  currentRecord,
  findRecord,
  isIdPath,
  parseContent,
  requireEvidence,
  revisionStates,
  validateWrite,
  type ResolvedRelation,
} from './record-checks.js';
import {
  AddressCrawlerQuestionInput,
  CreateRecordInput,
  ReviseRecordInput,
  WithdrawRecordInput,
  type EvidenceInput,
  type WriteOutput,
} from './record-inputs.js';
import { outsideSessionLinks, type CarriedLink } from './carry-over.js';
import { assertApiEndpointCitesCall } from './api-endpoint-check.js';
import { assertOneFieldPerDataItem } from './data-item-fields.js';
import { processForRecord } from './process-link.js';
import {
  assertProcessNotOnlyErrors,
  checkDrops,
  droppedLinks,
  droppedSteps,
  revisionContent,
} from './revision-guard.js';

/** The persona a process record names (its schema requires one). */
const personaOf = (content: unknown): string => {
  const p = (content as { persona?: unknown }).persona;
  return typeof p === 'string' && p ? p : 'guest';
};

interface RevisionWrite {
  session: SessionRow;
  record: { id: string; kind: DocKind; key: string };
  revNo: number;
  change: RevisionChange;
  content: DocContent;
  confidence: Confidence;
  notObservable: boolean;
  changeNote: string | null;
  respondsToReview: string | null;
  evidence: readonly EvidenceInput[];
  targets: readonly ResolvedTarget[];
  /** Links of the previous revision kept as they were (revise only, spec 004 F-16). */
  carried?: readonly CarriedLink[];
  relations: readonly ResolvedRelation[];
  status: StatusResult;
}

/** Insert the revision with its links and relations, and apply what the status engine decided. */
function writeRevision(ctx: BaContext, w: RevisionWrite, ts: string): void {
  const setStatus = ctx.raw.prepare(
    'UPDATE doc_revisions SET status = ? WHERE record_id = ? AND rev_no = ?',
  );
  for (const c of w.status.changes) setStatus.run(c.status, w.record.id, c.rev_no);

  const revisionId = newId();
  ctx.raw
    .prepare(
      `INSERT INTO doc_revisions (id, record_id, rev_no, session_id, change, content_json, confidence,
       not_observable, status, change_note, responds_to_review, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    )
    .run(
      revisionId,
      w.record.id,
      w.revNo,
      w.session.id,
      w.change,
      JSON.stringify(w.content),
      w.confidence,
      w.notObservable ? 1 : 0,
      w.changeNote,
      w.respondsToReview,
      ts,
    );

  // What a link cites is a typed ref (spec 039 § 15, migration 0040).
  const insertLink = ctx.raw.prepare(
    'INSERT INTO doc_evidence_links (id, revision_id, ref_id, run_id, note) VALUES (?, ?, ?, ?, ?)',
  );
  w.targets.forEach((t, i) =>
    insertLink.run(
      newId(),
      revisionId,
      insertEvidenceRef(ctx.raw, t.target_kind, t.target_id, t.region),
      t.run_id,
      w.evidence[i]!.note ?? null,
    ),
  );
  for (const l of w.carried ?? []) insertLink.run(newId(), revisionId, l.ref_id, l.run_id, l.note);

  const addRelation = ctx.raw.prepare(
    'INSERT INTO doc_relations (from_revision_id, to_record_id, type) VALUES (?, ?, ?)',
  );
  for (const r of w.relations) addRelation.run(revisionId, r.to.id, r.type);

  const { latest_rev, confirmed_rev, title, withdrawn } = w.status.record;
  ctx.raw
    .prepare(
      `UPDATE doc_records SET title = ?, latest_rev = ?, confirmed_rev = ?, withdrawn = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(title, latest_rev, confirmed_rev, withdrawn, ts, w.record.id);
}

/** A new record's row with the next key of its kind (a process record opens or links its process). */
function insertRecord(
  ctx: BaContext,
  session: SessionRow,
  {
    input,
    content,
    ts,
  }: { input: z.infer<typeof CreateRecordInput>; content: DocContent; ts: string },
): { recordId: string; key: string } {
  const seq = nextSeq(ctx.raw, session.portal_id, input.kind);
  const key = formatKey(input.kind, seq);
  const recordId = newId();
  if (input.process_key !== undefined && input.kind !== 'process')
    throw new ToolError('SCHEMA_INVALID', 'process_key goes with a process record only');
  const processId =
    input.kind === 'process'
      ? processForRecord(
          ctx,
          session.portal_id,
          {
            key,
            title: content.title,
            persona: personaOf(content),
            processKey: input.process_key,
          },
          ts,
        )
      : null;
  ctx.raw
    .prepare(
      `INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev, withdrawn,
       created_at, updated_at, process_id) VALUES (?, ?, ?, ?, ?, ?, 1, NULL, 0, ?, ?, ?)`,
    )
    .run(recordId, session.portal_id, input.kind, key, seq, content.title, ts, ts, processId);
  return { recordId, key };
}

/** Allocate a key and write revision 1 as a draft. */
export function createRecord(ctx: BaContext, raw: unknown): WriteOutput {
  requireEvidence(raw);
  const input = parseInput(CreateRecordInput, raw);
  const content = parseContent(input.kind, input.content);
  assertNoPii(content, 'content', isIdPath);
  assertOneFieldPerDataItem(ctx, content, input.evidence);
  assertApiEndpointCitesCall(ctx, content, input.evidence);
  assertNoPii(
    input.evidence.map((e) => e.note),
    'evidence.note',
  );

  return inTransaction(ctx, () => {
    const session = requireActiveSession(ctx, input.session_id);
    assertProcessNotOnlyErrors(ctx, input.kind, input.evidence);
    const { targets, relations } = validateWrite(ctx, session, {
      kind: input.kind,
      key: null,
      confidence: input.confidence,
      notObservable: input.not_observable,
      evidence: input.evidence,
      relations: input.relations,
    });

    const ts = nowIso();
    const status = applyStatusEvent([], {
      type: 'revision',
      rev_no: 1,
      change: 'create',
      title: content.title,
    });
    const { recordId, key } = insertRecord(ctx, session, { input, content, ts });
    writeRevision(
      ctx,
      {
        session,
        record: { id: recordId, kind: input.kind, key },
        revNo: 1,
        change: 'create',
        content,
        confidence: input.confidence,
        notObservable: input.not_observable,
        changeNote: null,
        respondsToReview: null,
        evidence: input.evidence,
        targets,
        relations,
        status,
      },
      ts,
    );
    if (input.kind === 'followup')
      ctx.raw
        .prepare(
          `INSERT INTO followup_tasks (record_id, status, run_id, blocked_reason, updated_at)
           VALUES (?, 'open', NULL, NULL, ?)`,
        )
        .run(recordId, ts);
    return { key, rev_no: 1 };
  });
}

/** A new draft revision of an existing record; its statuses are decided by the status engine. */
export function reviseRecord(ctx: BaContext, raw: unknown): WriteOutput {
  requireEvidence(raw);
  const input = parseInput(ReviseRecordInput, raw);
  assertNoPii(input.change_note, 'change_note');
  assertNoPii(
    input.evidence.map((e) => e.note),
    'evidence.note',
  );

  return inTransaction(ctx, () => {
    const session = requireActiveSession(ctx, input.session_id);
    const record = currentRecord(ctx, session, input.key, input.base_rev);
    const content = parseContent(record.kind, input.content);
    assertNoPii(content, 'content', isIdPath);
    assertOneFieldPerDataItem(ctx, content, input.evidence);
    assertApiEndpointCitesCall(ctx, content, input.evidence);
    assertProcessNotOnlyErrors(ctx, record.kind, input.evidence);
    const dropNote = checkDrops(
      droppedLinks(ctx, record.id, record.latest_rev, session.id, input.evidence),
      droppedSteps(revisionContent(ctx, record.id, record.latest_rev), content),
      input.dropped,
    );

    if (input.responds_to_review !== undefined) {
      const review = ctx.raw
        .prepare(
          `SELECT rev.record_id FROM doc_reviews v JOIN doc_revisions rev ON rev.id = v.revision_id
           WHERE v.id = ?`,
        )
        .get(input.responds_to_review) as { record_id: string } | undefined;
      if (!review || review.record_id !== record.id)
        throw new ToolError(
          'UNKNOWN_REF',
          `responds_to_review ${input.responds_to_review} is not a review of ${record.key}`,
          { responds_to_review: input.responds_to_review },
        );
    }

    const { targets, relations } = validateWrite(ctx, session, {
      kind: record.kind,
      key: record.key,
      confidence: input.confidence,
      notObservable: input.not_observable,
      evidence: input.evidence,
      relations: input.relations,
    });
    const revNo = record.latest_rev + 1;
    const status = applyStatusEvent(revisionStates(ctx, record.id), {
      type: 'revision',
      rev_no: revNo,
      change: 'revise',
      title: content.title,
    });
    writeRevision(
      ctx,
      {
        session,
        record,
        revNo,
        change: 'revise',
        content,
        confidence: input.confidence,
        notObservable: input.not_observable,
        changeNote: dropNote === null ? input.change_note : `${input.change_note} ${dropNote}`,
        respondsToReview: input.responds_to_review ?? null,
        evidence: input.evidence,
        targets,
        carried: outsideSessionLinks(ctx, record.id, record.latest_rev, session.id),
        relations,
        status,
      },
      nowIso(),
    );
    return { key: record.key, rev_no: revNo };
  });
}

/** Retire a record: a `withdraw` revision carrying the last content, and `withdrawn = 1`. The key is never reused. */
export function withdrawRecord(ctx: BaContext, raw: unknown): WriteOutput {
  requireEvidence(raw);
  const input = parseInput(WithdrawRecordInput, raw);
  assertNoPii(input.change_note, 'change_note');
  assertNoPii(
    input.evidence.map((e) => e.note),
    'evidence.note',
  );

  return inTransaction(ctx, () => {
    const session = requireActiveSession(ctx, input.session_id);
    const record = currentRecord(ctx, session, input.key, input.base_rev);
    if (record.withdrawn === 1)
      throw new ToolError('SCHEMA_INVALID', `${record.key} is already withdrawn`, {
        key: record.key,
      });
    const latest = ctx.raw
      .prepare(
        'SELECT content_json, confidence, not_observable FROM doc_revisions WHERE record_id = ? AND rev_no = ?',
      )
      .get(record.id, record.latest_rev) as {
      content_json: string;
      confidence: Confidence;
      not_observable: 0 | 1;
    };
    const content = JSON.parse(latest.content_json) as DocContent;
    const targets = resolveTargets(
      ctx.raw,
      session.portal_id,
      sessionRunIds(ctx, session.id),
      input.evidence,
      { elementKeysOf: elementKeysReader(ctx.raw, ctx.evidence.root) },
    );
    const revNo = record.latest_rev + 1;
    const status = applyStatusEvent(revisionStates(ctx, record.id), {
      type: 'revision',
      rev_no: revNo,
      change: 'withdraw',
      title: content.title,
    });
    const ts = nowIso();
    writeRevision(
      ctx,
      {
        session,
        record,
        revNo,
        change: 'withdraw',
        content,
        confidence: latest.confidence,
        notObservable: latest.not_observable === 1,
        changeNote: input.change_note,
        respondsToReview: null,
        evidence: input.evidence,
        targets,
        relations: [],
        status,
      },
      ts,
    );
    // A withdrawn follow-up must not be picked up by the crawler; a task already started keeps its status.
    if (record.kind === 'followup')
      ctx.raw
        .prepare(
          `UPDATE followup_tasks SET status = 'cancelled', updated_at = ?
           WHERE record_id = ? AND status = 'open'`,
        )
        .run(ts, record.id);
    return { key: record.key, rev_no: revNo };
  });
}

/**
 * Mark a crawler open question `addressed`. Only when the latest revision of `by_key` cites that
 * question as evidence, so every addressed question points at the record that deals with it.
 */
export function addressCrawlerQuestion(
  ctx: BaContext,
  raw: unknown,
): { open_question_id: string; status: 'addressed'; by_key: string } {
  const input = parseInput(AddressCrawlerQuestionInput, raw);
  return inTransaction(ctx, () => {
    const session = requireActiveSession(ctx, input.session_id);
    const question = ctx.raw
      .prepare(
        `SELECT q.id, r.portal_id FROM open_questions q JOIN runs r ON r.id = q.run_id WHERE q.id = ?`,
      )
      .get(input.open_question_id) as { id: string; portal_id: string } | undefined;
    if (!question)
      throw new ToolError('UNKNOWN_REF', `no crawler open question ${input.open_question_id}`, {
        open_question_id: input.open_question_id,
      });
    if (question.portal_id !== session.portal_id)
      throw new ToolError(
        'PORTAL_MISMATCH',
        `open question ${question.id} belongs to portal ${question.portal_id}, not ${session.portal_id}`,
        { open_question_id: question.id, portal_id: question.portal_id },
      );
    const record = findRecord(ctx, session.portal_id, input.by_key);
    const cites = ctx.raw
      .prepare(
        `SELECT 1 FROM doc_evidence l JOIN doc_revisions rev ON rev.id = l.revision_id
         WHERE rev.record_id = ? AND rev.rev_no = ? AND l.target_kind = 'open_question' AND l.target_id = ?`,
      )
      .get(record.id, record.latest_rev, question.id);
    if (!cites)
      throw new ToolError(
        'MISSING_EVIDENCE',
        `the latest revision of ${record.key} does not cite open question ${question.id}; add it to that record's evidence first`,
        { by_key: record.key, open_question_id: question.id },
      );
    ctx.raw.prepare("UPDATE open_questions SET status = 'addressed' WHERE id = ?").run(question.id);
    return { open_question_id: question.id, status: 'addressed', by_key: record.key };
  });
}
