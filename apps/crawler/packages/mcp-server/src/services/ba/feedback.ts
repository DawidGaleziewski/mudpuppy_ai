import type { FollowupStatus, ReviewAction, RevisionStatus } from '@pathfinder/core';
import { z } from 'zod';
import type { BaContext } from '../../context.js';
import { parseInput } from '../../errors.js';

export const GetPendingFeedbackInput = z.object({ portal_id: z.string().min(1) }).strict();

export interface PendingReview {
  review_id: string;
  action: ReviewAction;
  reviewer: string;
  text: string | null;
  created_at: string;
  /** The record and revision the review is about. */
  key: string;
  title: string;
  rev_no: number;
  revision_status: RevisionStatus;
  latest_rev: number;
  /** Revision that already answers this review (`responds_to_review`), if any. */
  answered_by_rev: number | null;
}

export interface FollowupChange {
  key: string;
  title: string;
  status: FollowupStatus;
  run_id: string | null;
  blocked_reason: string | null;
  updated_at: string;
}

export interface PendingFeedback {
  /** End of the portal's previous completed session; null when there was none (everything is pending). */
  since: string | null;
  reviews: PendingReview[];
  followups: FollowupChange[];
}

/** When the portal's previous completed session ended. */
function previousSessionEnd(ctx: BaContext, portalId: string): string | null {
  const row = ctx.raw
    .prepare(
      `SELECT MAX(ended_at) AS ended_at FROM analysis_sessions
       WHERE portal_id = ? AND status = 'completed'`,
    )
    .get(portalId) as { ended_at: string | null };
  return row.ended_at;
}

/**
 * What humans and the crawler did since the BA last finished: reviews (rejections and comments to
 * answer, confirmations to know about) and follow-up tasks that left `open`.
 */
export function pendingFeedback(ctx: BaContext, portalId: string): PendingFeedback {
  const since = previousSessionEnd(ctx, portalId);
  const reviews = ctx.raw
    .prepare(
      `SELECT v.id AS review_id, v.action, v.reviewer, v.text, v.created_at,
              r.key, r.title, rev.rev_no, rev.status AS revision_status, r.latest_rev,
              (SELECT MIN(a.rev_no) FROM doc_revisions a WHERE a.responds_to_review = v.id) AS answered_by_rev
       FROM doc_reviews v
       JOIN doc_revisions rev ON rev.id = v.revision_id
       JOIN doc_records r ON r.id = rev.record_id
       WHERE r.portal_id = ? AND (? IS NULL OR v.created_at > ?)
       ORDER BY v.created_at, v.id`,
    )
    .all(portalId, since, since) as PendingReview[];
  const followups = ctx.raw
    .prepare(
      `SELECT r.key, r.title, t.status, t.run_id, t.blocked_reason, t.updated_at
       FROM followup_tasks t
       JOIN doc_records r ON r.id = t.record_id
       WHERE r.portal_id = ? AND t.status <> 'open' AND (? IS NULL OR t.updated_at > ?)
       ORDER BY r.seq`,
    )
    .all(portalId, since, since) as FollowupChange[];
  return { since, reviews, followups };
}

/** The counts `start_session` returns, so the agent knows whether to read the feedback first. */
export function feedbackSummary(feedback: PendingFeedback): Record<string, number> {
  const count = (action: ReviewAction): number =>
    feedback.reviews.filter((r) => r.action === action).length;
  return {
    rejections: count('reject'),
    comments: count('comment'),
    confirmations: count('confirm'),
    unanswered: feedback.reviews.filter((r) => r.action !== 'confirm' && r.answered_by_rev === null)
      .length,
    followups_changed: feedback.followups.length,
  };
}

export function getPendingFeedback(ctx: BaContext, raw: unknown): PendingFeedback {
  const input = parseInput(GetPendingFeedbackInput, raw);
  return pendingFeedback(ctx, input.portal_id);
}
