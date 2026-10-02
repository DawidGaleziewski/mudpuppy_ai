import type { ReviewAction, RevisionChange, RevisionStatus } from '@pathfinder/core';
import { DocsError } from './errors.js';

/** What the engine needs to know about one stored revision. */
export interface RevisionState {
  rev_no: number;
  status: RevisionStatus;
  change: RevisionChange;
  /** `content_json.title`, copied to the record for listing. */
  title: string;
}

export type StatusEvent =
  | { type: 'revision'; rev_no: number; change: RevisionChange; title: string }
  | { type: 'review'; action: ReviewAction; rev_no: number; text?: string | null };

/** Denormalised `doc_records` columns, always derived from the revisions. */
export interface RecordColumns {
  latest_rev: number;
  confirmed_rev: number | null;
  title: string;
  withdrawn: 0 | 1;
}

export interface StatusResult {
  /** Every revision after the event, by `rev_no`; a new revision is the last entry. */
  revisions: RevisionState[];
  /** Existing revisions whose status the caller must update. */
  changes: { rev_no: number; status: RevisionStatus }[];
  record: RecordColumns;
}

/** The record columns that follow from a set of revisions. */
export function recordColumns(revisions: readonly RevisionState[]): RecordColumns {
  const latest = revisions.at(-1);
  if (!latest) throw new Error('a record has at least one revision');
  const confirmed = revisions.filter((r) => r.status === 'confirmed').at(-1);
  return {
    latest_rev: latest.rev_no,
    confirmed_rev: confirmed?.rev_no ?? null,
    title: latest.title,
    withdrawn: latest.change === 'withdraw' ? 1 : 0,
  };
}

/**
 * The only place a revision status is decided (research §4). Pure: current revisions and one event in,
 * the row updates out. Agents and reviewers never pass a status.
 *
 * - a new revision is `draft`; the previous latest, if still `draft`, becomes `superseded`
 * - a `confirmed` revision stays until a newer one is confirmed, then becomes `superseded`
 * - confirm and reject apply only to the latest revision while it is `draft` (else `STALE_REVISION`)
 * - reject needs a reason; a comment changes nothing
 */
export function applyStatusEvent(
  current: readonly RevisionState[],
  event: StatusEvent,
): StatusResult {
  const revisions = [...current].sort((a, b) => a.rev_no - b.rev_no).map((r) => ({ ...r }));
  const latest = revisions.at(-1);
  const changes: StatusResult['changes'] = [];
  const set = (rev: RevisionState, status: RevisionStatus): void => {
    rev.status = status;
    changes.push({ rev_no: rev.rev_no, status });
  };

  if (event.type === 'revision') {
    const expected = (latest?.rev_no ?? 0) + 1;
    if (event.rev_no !== expected)
      throw new DocsError(
        'STALE_REVISION',
        `revision ${event.rev_no} does not follow the latest revision ${latest?.rev_no ?? 0}`,
        { latest_rev: latest?.rev_no ?? 0 },
      );
    if (latest === undefined && event.change !== 'create')
      throw new DocsError('SCHEMA_INVALID', 'the first revision of a record must be a create');
    if (latest !== undefined && event.change === 'create')
      throw new DocsError('SCHEMA_INVALID', 'only the first revision of a record is a create');
    if (latest?.status === 'draft') set(latest, 'superseded');
    revisions.push({
      rev_no: event.rev_no,
      status: 'draft',
      change: event.change,
      title: event.title,
    });
    return { revisions, changes, record: recordColumns(revisions) };
  }

  const target = revisions.find((r) => r.rev_no === event.rev_no);
  if (!target || !latest)
    throw new DocsError('UNKNOWN_REF', `revision ${event.rev_no} does not exist`, {
      latest_rev: latest?.rev_no ?? 0,
    });

  if (event.action !== 'confirm' && !event.text?.trim())
    throw new DocsError('SCHEMA_INVALID', `text is required for ${event.action}`);

  if (event.action !== 'comment') {
    if (target !== latest || target.status !== 'draft')
      throw new DocsError(
        'STALE_REVISION',
        `only the latest draft revision can be reviewed; latest is revision ${latest.rev_no} (${latest.status})`,
        { latest_rev: latest.rev_no, status: latest.status },
      );
    if (event.action === 'confirm') {
      for (const r of revisions) if (r !== target && r.status === 'confirmed') set(r, 'superseded');
      set(target, 'confirmed');
    } else {
      set(target, 'rejected');
    }
  }
  return { revisions, changes, record: recordColumns(revisions) };
}
