import {
  Confidence,
  DOC_CONTENT_BY_KIND,
  DocKind,
  EvidenceTargetKind,
  RelationType,
  newId,
  nowIso,
  type DocContent,
  type DocRecordsTable,
  type RevisionChange,
  type Selectable,
} from '@pathfinder/core';
import {
  applyStatusEvent,
  checkObserved,
  formatKey,
  isAllowed,
  nextSeq,
  resolveTargets,
  type ResolvedTarget,
  type RevisionState,
  type StatusResult,
} from '@pathfinder/docs';
import { z } from 'zod';
import type { BaContext } from '../../context.js';
import { ToolError, parseInput } from '../../errors.js';
import {
  assertNoPii,
  inTransaction,
  requireActiveSession,
  sessionRunIds,
  type SessionRow,
} from './common.js';

type RecordRow = Selectable<DocRecordsTable>;

const EvidenceInput = z
  .object({
    target_kind: EvidenceTargetKind,
    target_id: z.string().min(1),
    /** Only on a `state` link: the run whose observation was read. */
    run_id: z.string().min(1).optional(),
    note: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();
type EvidenceInput = z.infer<typeof EvidenceInput>;

const RelationInput = z.object({ type: RelationType, to_key: z.string().min(1) }).strict();
type RelationInput = z.infer<typeof RelationInput>;

const Content = z.record(z.string(), z.unknown());

export const CreateRecordInput = z
  .object({
    session_id: z.string().min(1),
    kind: DocKind,
    content: Content,
    confidence: Confidence,
    not_observable: z.boolean().default(false),
    evidence: z.array(EvidenceInput),
    relations: z.array(RelationInput).default([]),
  })
  .strict();

export const ReviseRecordInput = z
  .object({
    session_id: z.string().min(1),
    key: z.string().min(1),
    base_rev: z.number().int().positive(),
    content: Content,
    confidence: Confidence,
    not_observable: z.boolean().default(false),
    evidence: z.array(EvidenceInput),
    relations: z.array(RelationInput).default([]),
    change_note: z.string().trim().min(1).max(2000),
    responds_to_review: z.string().min(1).optional(),
  })
  .strict();

export const WithdrawRecordInput = z
  .object({
    session_id: z.string().min(1),
    key: z.string().min(1),
    base_rev: z.number().int().positive(),
    change_note: z.string().trim().min(1).max(2000),
    evidence: z.array(EvidenceInput),
  })
  .strict();

export const AddressCrawlerQuestionInput = z
  .object({
    session_id: z.string().min(1),
    open_question_id: z.string().min(1),
    by_key: z.string().min(1),
  })
  .strict();

export interface WriteOutput {
  key: string;
  rev_no: number;
}

/**
 * The evidence gate comes before schema validation so the caller gets the specific code (Principle II):
 * a write with no evidence is MISSING_EVIDENCE, whatever else is wrong with it.
 */
function requireEvidence(raw: unknown): void {
  const evidence = (raw as { evidence?: unknown } | null)?.evidence;
  if (!Array.isArray(evidence) || evidence.length === 0)
    throw new ToolError(
      'MISSING_EVIDENCE',
      'evidence is required: cite at least one state, edge, action, form, network call, rule candidate, crawler question, record or review',
    );
}

/** Validate `content` against the kind's schema; unknown fields are refused so a typo is not silently dropped. */
function parseContent(kind: DocKind, content: Record<string, unknown>): DocContent {
  if ('kind' in content && content.kind !== kind)
    throw new ToolError(
      'SCHEMA_INVALID',
      `content.kind is ${JSON.stringify(content.kind)} but the record is a ${kind}`,
    );
  const r = DOC_CONTENT_BY_KIND[kind].strict().safeParse({ ...content, kind });
  if (r.success) return r.data;
  throw new ToolError(
    'SCHEMA_INVALID',
    r.error.issues
      .map((i) => `content${i.path.length ? `.${i.path.join('.')}` : ''}: ${i.message}`)
      .join('; '),
    { kind },
  );
}

/** `seen_in[].target_id` of a data item holds a server id, which the scrubber would read as a token. */
const isIdPath = (path: string): boolean => /^content\.seen_in\[\d+\]\.target_id$/.test(path);

function findRecord(ctx: BaContext, portalId: string, key: string): RecordRow {
  const record = ctx.raw
    .prepare('SELECT * FROM doc_records WHERE portal_id = ? AND key = ?')
    .get(portalId, key) as RecordRow | undefined;
  if (!record)
    throw new ToolError('RECORD_NOT_FOUND', `no record ${key} in portal ${portalId}`, { key });
  return record;
}

function revisionStates(ctx: BaContext, recordId: string): RevisionState[] {
  return ctx.raw
    .prepare(
      `SELECT rev_no, status, change, json_extract(content_json, '$.title') AS title
       FROM doc_revisions WHERE record_id = ? ORDER BY rev_no`,
    )
    .all(recordId) as RevisionState[];
}

interface ResolvedRelation {
  type: RelationType;
  to: RecordRow;
}

/** Every relation must point at a record of the portal and be an allowed (from kind, type, to kind) triple. */
function resolveRelations(
  ctx: BaContext,
  portalId: string,
  fromKind: DocKind,
  fromKey: string | null,
  relations: readonly RelationInput[],
): ResolvedRelation[] {
  const out = new Map<string, ResolvedRelation>();
  for (const rel of relations) {
    const to = findRecord(ctx, portalId, rel.to_key);
    if (to.key === fromKey)
      throw new ToolError('RELATION_NOT_ALLOWED', `a record cannot relate to itself (${to.key})`, {
        type: rel.type,
        to_key: to.key,
      });
    const check = isAllowed(fromKind, rel.type, to.kind);
    if (!check.ok)
      throw new ToolError(check.code, check.message, { ...check.details, to_key: to.key });
    out.set(`${rel.type} ${to.id}`, { type: rel.type, to });
  }
  return [...out.values()];
}

/**
 * Not-observable behaviour must come with a question someone can answer: a crawler open question or
 * an `open_question` record in the evidence, a relation to an `open_question` record, or the record
 * being that question itself.
 */
function assertQuestionLinked(
  ctx: BaContext,
  kind: DocKind,
  targets: readonly ResolvedTarget[],
  relations: readonly ResolvedRelation[],
): void {
  if (kind === 'open_question') return;
  if (targets.some((t) => t.target_kind === 'open_question')) return;
  if (relations.some((r) => r.to.kind === 'open_question')) return;
  const kindOf = ctx.raw.prepare('SELECT kind FROM doc_records WHERE id = ?');
  const citesQuestion = targets.some(
    (t) =>
      t.target_kind === 'doc_record' &&
      (kindOf.get(t.target_id) as { kind: DocKind }).kind === 'open_question',
  );
  if (citesQuestion) return;
  throw new ToolError(
    'NOT_OBSERVABLE_NEEDS_QUESTION',
    'not_observable needs a question: cite a crawler open question or an open_question record in evidence, or relate the record to an open_question record (create the question first)',
  );
}

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

  const addLink = ctx.raw.prepare(
    `INSERT INTO doc_evidence_links (id, revision_id, target_kind, target_id, run_id, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  w.targets.forEach((t, i) =>
    addLink.run(
      newId(),
      revisionId,
      t.target_kind,
      t.target_id,
      t.run_id,
      w.evidence[i]!.note ?? null,
    ),
  );

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

/** The checks every content-bearing write shares; returns what the revision will cite and relate to. */
function validateWrite(
  ctx: BaContext,
  session: SessionRow,
  args: {
    kind: DocKind;
    key: string | null;
    confidence: Confidence;
    notObservable: boolean;
    evidence: readonly EvidenceInput[];
    relations: readonly RelationInput[];
  },
): { targets: ResolvedTarget[]; relations: ResolvedRelation[] } {
  const targets = resolveTargets(
    ctx.raw,
    session.portal_id,
    sessionRunIds(ctx, session.id),
    args.evidence,
  );
  if (args.confidence === 'observed') {
    const check = checkObserved(targets);
    if (!check.ok)
      throw new ToolError(
        'INVALID_CONFIDENCE',
        'observed needs evidence that was itself observed: a state, edge, form, action or network call. Rule candidates, questions, decisions, records and reviews do not count; use inferred or needs_confirmation',
        { checked: check.checked },
      );
  }
  const relations = resolveRelations(ctx, session.portal_id, args.kind, args.key, args.relations);
  if (args.notObservable) assertQuestionLinked(ctx, args.kind, targets, relations);
  return { targets, relations };
}

/** Allocate a key and write revision 1 as a draft. */
export function createRecord(ctx: BaContext, raw: unknown): WriteOutput {
  requireEvidence(raw);
  const input = parseInput(CreateRecordInput, raw);
  const content = parseContent(input.kind, input.content);
  assertNoPii(content, 'content', isIdPath);
  assertNoPii(
    input.evidence.map((e) => e.note),
    'evidence.note',
  );

  return inTransaction(ctx, () => {
    const session = requireActiveSession(ctx, input.session_id);
    const { targets, relations } = validateWrite(ctx, session, {
      kind: input.kind,
      key: null,
      confidence: input.confidence,
      notObservable: input.not_observable,
      evidence: input.evidence,
      relations: input.relations,
    });

    const ts = nowIso();
    const seq = nextSeq(ctx.raw, session.portal_id, input.kind);
    const key = formatKey(input.kind, seq);
    const recordId = newId();
    const status = applyStatusEvent([], {
      type: 'revision',
      rev_no: 1,
      change: 'create',
      title: content.title,
    });
    ctx.raw
      .prepare(
        `INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev, withdrawn,
         created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, NULL, 0, ?, ?)`,
      )
      .run(recordId, session.portal_id, input.kind, key, seq, content.title, ts, ts);
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

/** The record a revise/withdraw targets, refused unless `base_rev` is still the latest revision. */
function currentRecord(
  ctx: BaContext,
  session: SessionRow,
  key: string,
  baseRev: number,
): RecordRow {
  const record = findRecord(ctx, session.portal_id, key);
  if (record.latest_rev !== baseRev)
    throw new ToolError(
      'STALE_REVISION',
      `${key} is at revision ${record.latest_rev}, not ${baseRev}; read it again with get_record and retry on the latest`,
      { key, latest_rev: record.latest_rev },
    );
  return record;
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
        changeNote: input.change_note,
        respondsToReview: input.responds_to_review ?? null,
        evidence: input.evidence,
        targets,
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
        `SELECT 1 FROM doc_evidence_links l JOIN doc_revisions rev ON rev.id = l.revision_id
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
