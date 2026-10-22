/** The checks a BA record write passes before anything is written (Principle II, spec 019 US4). */
import type { Confidence } from '@mudpuppy/core';
import {
  DOC_CONTENT_BY_KIND,
  type DocContent,
  type DocKind,
  type RelationType,
} from '@mudpuppy/docs-model';
import type { DocRecordsTable, Selectable } from '@mudpuppy/store';
import {
  checkObserved,
  describeRecordKind,
  describeRelations,
  elementKeysReader,
  isAllowed,
  resolveTargets,
  type ResolvedTarget,
  type RevisionState,
} from '@mudpuppy/docs';
import type { BaContext } from '../../context.js';
import { ToolError } from '../../errors.js';
import { sessionRunIds, type SessionRow } from './common.js';
import type { EvidenceInput, RelationInput } from './record-inputs.js';

export type RecordRow = Selectable<DocRecordsTable>;

/**
 * The evidence gate comes before schema validation so the caller gets the specific code (Principle II):
 * a write with no evidence is MISSING_EVIDENCE, whatever else is wrong with it.
 */
export function requireEvidence(raw: unknown): void {
  const evidence = (raw as { evidence?: unknown } | null)?.evidence;
  if (!Array.isArray(evidence) || evidence.length === 0)
    throw new ToolError(
      'MISSING_EVIDENCE',
      'evidence is required: cite at least one state, edge, action, form, network call, crawler question, record or review',
    );
}

/** Validate `content` against the kind's schema; unknown fields are refused so a typo is not silently dropped. */
export function parseContent(kind: DocKind, content: Record<string, unknown>): DocContent {
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
    // The whole expected shape, so one retry fixes every field (spec 015 F-20, spec 019 US4).
    { kind, expected: describeRecordKind(kind) },
  );
}

/** `seen_in[].target_id` of a data item holds a server id, which the scrubber would read as a token. */
export const isIdPath = (path: string): boolean =>
  /^content\.seen_in\[\d+\]\.target_id$/.test(path);

export function findRecord(ctx: BaContext, portalId: string, key: string): RecordRow {
  const record = ctx.raw
    .prepare('SELECT * FROM doc_records WHERE portal_id = ? AND key = ?')
    .get(portalId, key) as RecordRow | undefined;
  if (!record)
    throw new ToolError('RECORD_NOT_FOUND', `no record ${key} in portal ${portalId}`, { key });
  return record;
}

export function revisionStates(ctx: BaContext, recordId: string): RevisionState[] {
  return ctx.raw
    .prepare(
      `SELECT rev_no, status, change, json_extract(content_json, '$.title') AS title
       FROM doc_revisions WHERE record_id = ? ORDER BY rev_no`,
    )
    .all(recordId) as RevisionState[];
}

export interface ResolvedRelation {
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
      throw new ToolError(check.code, check.message, {
        ...check.details,
        to_key: to.key,
        // Every relation this kind may assert, not only those of the type it tried (spec 019 US4).
        allowed_from_kind: describeRelations(fromKind),
      });
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

/** The checks every content-bearing write shares; returns what the revision will cite and relate to. */
export function validateWrite(
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
    { elementKeysOf: elementKeysReader(ctx.raw, ctx.evidence.root) },
  );
  if (args.confidence === 'observed') {
    const check = checkObserved(targets);
    if (!check.ok)
      throw new ToolError(
        'INVALID_CONFIDENCE',
        'observed needs evidence that was itself observed: a state, screen region, edge, form, action, network call, process step or page visit. Rule candidates, questions, decisions, records and reviews do not count; use inferred or needs_confirmation',
        { checked: check.checked },
      );
  }
  const relations = resolveRelations(ctx, session.portal_id, args.kind, args.key, args.relations);
  if (args.notObservable) assertQuestionLinked(ctx, args.kind, targets, relations);
  return { targets, relations };
}

/** The record a revise/withdraw targets, refused unless `base_rev` is still the latest revision. */
export function currentRecord(
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
