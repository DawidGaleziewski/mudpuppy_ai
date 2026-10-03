import { newId, nowIso, ReviewAction, type RevisionStatus } from '@pathfinder/core';
import { z } from 'zod';
import { DocsError } from './errors.js';
import type { RawDb } from './keys.js';
import { applyStatusEvent, type RevisionState } from './status-engine.js';

/**
 * Human review of documentation (spec 004 US3, contracts/operator-cli.md `docs:review`). The only
 * write path for reviews: the dashboard runs it as a subprocess, an operator by hand. Status follows
 * from the review through the status engine; nobody passes a status (constitution 1.4.0, VI).
 */

const Reviewer = z.string().trim().min(1).max(200);

export const ReviewInput = z
  .object({
    portal_id: z.string().min(1),
    key: z.string().min(1),
    rev_no: z.number().int().positive(),
    action: ReviewAction,
    text: z.string().trim().min(1).max(4000).optional(),
    reviewer: Reviewer,
  })
  .strict()
  .refine((r) => r.action === 'confirm' || r.text !== undefined, {
    message: 'required for reject and comment',
    path: ['text'],
  });
export type ReviewInput = z.infer<typeof ReviewInput>;

export const CancelFollowupInput = z
  .object({
    portal_id: z.string().min(1),
    key: z.string().min(1),
    reviewer: Reviewer,
    text: z.string().trim().min(1).max(4000),
  })
  .strict();
export type CancelFollowupInput = z.infer<typeof CancelFollowupInput>;

export interface ReviewResult {
  ok: true;
  review_id: string;
  key: string;
  rev_no: number;
  /** The reviewed revision's status after the review. */
  status: RevisionStatus;
}

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (r.success) return r.data;
  throw new DocsError(
    'SCHEMA_INVALID',
    r.error.issues
      .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
      .join('; '),
  );
}

interface RecordRow {
  id: string;
  kind: string;
  key: string;
}

function findRecord(raw: RawDb, portalId: string, key: string): RecordRow {
  const row = raw
    .prepare('SELECT id, kind, key FROM doc_records WHERE portal_id = ? AND key = ?')
    .get(portalId, key) as RecordRow | undefined;
  if (!row)
    throw new DocsError('RECORD_NOT_FOUND', `no record ${key} in portal ${portalId}`, { key });
  return row;
}

/**
 * Record one review of one revision in a single transaction: the `doc_reviews` row, the status
 * engine's revision changes and the denormalised `doc_records` columns.
 */
export function applyReview(raw: RawDb, input: unknown): ReviewResult {
  const r = parse(ReviewInput, input);
  return raw.transaction((): ReviewResult => {
    const record = findRecord(raw, r.portal_id, r.key);
    const revisions = raw
      .prepare(
        `SELECT id, rev_no, status, change, json_extract(content_json, '$.title') AS title
         FROM doc_revisions WHERE record_id = ? ORDER BY rev_no`,
      )
      .all(record.id) as (RevisionState & { id: string })[];
    const result = applyStatusEvent(revisions, {
      type: 'review',
      action: r.action,
      rev_no: r.rev_no,
      text: r.text ?? null,
    });
    const target = revisions.find((x) => x.rev_no === r.rev_no)!;
    const ts = nowIso();
    const reviewId = newId();
    raw
      .prepare(
        `INSERT INTO doc_reviews (id, revision_id, action, reviewer, text, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(reviewId, target.id, r.action, r.reviewer, r.text ?? null, ts);
    const setStatus = raw.prepare(
      'UPDATE doc_revisions SET status = ? WHERE record_id = ? AND rev_no = ?',
    );
    for (const c of result.changes) setStatus.run(c.status, record.id, c.rev_no);
    if (result.changes.length > 0)
      raw
        .prepare(
          `UPDATE doc_records SET latest_rev = ?, confirmed_rev = ?, title = ?, withdrawn = ?,
           updated_at = ? WHERE id = ?`,
        )
        .run(
          result.record.latest_rev,
          result.record.confirmed_rev,
          result.record.title,
          result.record.withdrawn,
          ts,
          record.id,
        );
    const status = result.revisions.find((x) => x.rev_no === r.rev_no)!.status;
    return { ok: true, review_id: reviewId, key: record.key, rev_no: r.rev_no, status };
  })();
}

/**
 * Operator cancels a follow-up task that has not finished (research §11): `open`, `in_progress` or
 * `blocked` → `cancelled`, with the reason as the blocked reason. A done or cancelled task stays.
 */
export function cancelFollowup(
  raw: RawDb,
  input: unknown,
): { ok: true; key: string; status: 'cancelled' } {
  const c = parse(CancelFollowupInput, input);
  return raw.transaction(() => {
    const record = findRecord(raw, c.portal_id, c.key);
    if (record.kind !== 'followup')
      throw new DocsError('SCHEMA_INVALID', `${c.key} is a ${record.kind}, not a follow-up`);
    const task = raw
      .prepare('SELECT status FROM followup_tasks WHERE record_id = ?')
      .get(record.id) as { status: string } | undefined;
    if (!task || task.status === 'done' || task.status === 'cancelled')
      throw new DocsError(
        'NOT_CANCELLABLE',
        `${c.key} is ${task?.status ?? 'without a task'}; only an unfinished follow-up can be cancelled`,
        { status: task?.status ?? null },
      );
    raw
      .prepare(
        `UPDATE followup_tasks SET status = 'cancelled', blocked_reason = ?, updated_at = ?
         WHERE record_id = ?`,
      )
      .run(`cancelled by ${c.reviewer}: ${c.text}`, nowIso(), record.id);
    return { ok: true as const, key: record.key, status: 'cancelled' as const };
  })();
}
