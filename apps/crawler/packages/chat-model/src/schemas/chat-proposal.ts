import { z } from 'zod';
import { Id, Timestamp } from '@pathfinder/core';

/** `amendment` edits an existing amendment (text / re-anchor); `new_amendment` creates one. */
export const ChatProposalTargetKind = z.enum(['amendment', 'new_amendment']);
export type ChatProposalTargetKind = z.infer<typeof ChatProposalTargetKind>;

/** open -> applied | discarded | stale (the amendment head moved past `base_rev`). */
export const ChatProposalStatus = z.enum(['open', 'applied', 'discarded', 'stale']);
export type ChatProposalStatus = z.infer<typeof ChatProposalStatus>;

/**
 * A change the chat assistant proposes and a person applies or discards (`chat_proposals`, 0017,
 * spec 022 research.md R6). The assistant never writes amendments itself; applying runs the same
 * revision write path as a BA edit. `payload` is a JSON object (stored as TEXT), e.g. `{"text": "..."}`
 * or `{"target_kind","target_id","text","kind"}` for a new amendment. Not a Layer B evidence record:
 * no evidence_ref/confidence.
 */
export const ChatProposal = z
  .object({
    id: Id,
    conversation_id: Id,
    portal_id: z.string().min(1),
    target_kind: ChatProposalTargetKind,
    /** The amendment id for `amendment`; NULL for `new_amendment`. */
    target_id: z.string().min(1).nullable(),
    /** The amendment revision the proposal was made on; NULL for `new_amendment`. */
    base_rev: z.number().int().min(1).nullable(),
    payload: z.record(z.string(), z.unknown()),
    /** The one line the drawer shows. */
    summary: z.string().min(1),
    status: ChatProposalStatus,
    /** Set when applied: the created or changed amendment. */
    applied_amendment_id: Id.nullable(),
    /** Set when applied: the amendment revision that applying created. */
    applied_rev: z.number().int().min(1).nullable(),
    decided_by: z.string().nullable(),
    decided_at: Timestamp.nullable(),
    created_at: Timestamp,
  })
  .superRefine((p, ctx) => {
    const need = (ok: boolean, path: string, message: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [path], message });
    };
    if (p.target_kind === 'amendment') {
      need(p.target_id !== null, 'target_id', 'target_id is required for an amendment proposal');
      need(p.base_rev !== null, 'base_rev', 'base_rev is required for an amendment proposal');
    } else {
      need(p.target_id === null, 'target_id', 'target_id must be null for a new amendment');
      need(p.base_rev === null, 'base_rev', 'base_rev must be null for a new amendment');
    }
    if (p.status === 'applied') {
      need(p.applied_amendment_id !== null, 'applied_amendment_id', 'required when applied');
      need(p.applied_rev !== null, 'applied_rev', 'required when applied');
    }
    if (p.status !== 'open') need(p.decided_at !== null, 'decided_at', 'required once decided');
  });
export type ChatProposal = z.infer<typeof ChatProposal>;
