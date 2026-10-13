import { z } from 'zod';
import { Id, Timestamp } from '@pathfinder/core';

export const AmendmentTargetKind = z.enum(['state', 'evidence', 'wireframe_element']);
export type AmendmentTargetKind = z.infer<typeof AmendmentTargetKind>;

export const AmendmentKind = z.enum(['note', 'element_ref', 'attachment']);
export type AmendmentKind = z.infer<typeof AmendmentKind>;

/**
 * active -> needs_reanchor (a scan changed the screen and the anchor is gone) -> active (re-anchored) | dismissed;
 * active -> withdrawn -> active (restored). 0016 replaced `superseded` by `needs_reanchor`.
 */
export const AmendmentStatus = z.enum(['active', 'needs_reanchor', 'dismissed', 'withdrawn']);
export type AmendmentStatus = z.infer<typeof AmendmentStatus>;

export const AmendmentSupersededReason = z.enum([
  'state_replaced',
  'element_changed',
  'element_removed',
]);
export type AmendmentSupersededReason = z.infer<typeof AmendmentSupersededReason>;

/** Anchor to the element an amendment was written against (`amendments.anchor_element`, JSON). */
// Shape fixed in T011 (research.md R8b): `key` is the element key (`role "name"`, `#n` for repeats),
// which is also the wireframe shape id; `roleIndex` is the position among same-role elements.
export const AmendmentAnchorElement = z.object({
  key: z.string().min(1),
  role: z.string().min(1),
  name: z.string(),
  roleIndex: z.number().int().nonnegative(),
});
export type AmendmentAnchorElement = z.infer<typeof AmendmentAnchorElement>;

/**
 * A BA amendment (`amendments`, 0008). Never joined into Layer B records; the export renders them in
 * their own chapter. `key` is `AMD-nnn`, unique per portal. Rows are never deleted; every change is a row in `amendment_revisions` (0016).
 * Not a Layer B evidence record: no evidence_ref/confidence.
 */
export const Amendment = z
  .object({
    id: Id,
    key: z.string().regex(/^AMD-\d{3,}$/),
    portal_id: z.string().min(1),
    scope_id: Id.nullable(),
    target_kind: AmendmentTargetKind,
    target_id: z.string().min(1),
    kind: AmendmentKind,
    text: z.string().nullable(),
    attachment_sha256: z.string().length(64).nullable(),
    attachment_name: z.string().nullable(),
    author: z.string().min(1),
    status: AmendmentStatus,
    anchor_fingerprint: z.string().nullable(),
    anchor_route_template: z.string().nullable(),
    anchor_element: AmendmentAnchorElement.nullable(),
    superseded_by_run: Id.nullable(),
    superseded_reason: AmendmentSupersededReason.nullable(),
    /** Short text explaining `superseded_reason`. */
    superseded_detail: z.string().nullable(),
    superseded_at: Timestamp.nullable(),
    dismissed_at: Timestamp.nullable(),
    /** Id of the new active copy, when the BA re-applied this amendment. */
    reapplied_as: Id.nullable(),
    /** Id of the original this row copies. */
    reapplies: Id.nullable(),
    created_at: Timestamp,
    withdrawn_at: Timestamp.nullable(),
    /** 0016: the head's current revision number (>= 1). */
    rev: z.number().int().min(1),
    /** 0016: the screen the amendment belongs to; NULL when no state could be resolved. */
    screen_id: Id.nullable(),
  })
  .superRefine((a, ctx) => {
    const need = (ok: boolean, path: string, message: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [path], message });
    };
    need(a.kind !== 'note' || a.text !== null, 'text', 'text is required for a note');
    need(
      a.kind !== 'attachment' || (a.attachment_sha256 !== null && a.attachment_name !== null),
      'attachment_sha256',
      'attachment_sha256 and attachment_name are required for an attachment',
    );
    need(
      a.status !== 'dismissed' || a.dismissed_at !== null,
      'dismissed_at',
      'dismissed_at is required when dismissed',
    );
    need(
      a.status !== 'withdrawn' || a.withdrawn_at !== null,
      'withdrawn_at',
      'withdrawn_at is required when withdrawn',
    );
  });
export type Amendment = z.infer<typeof Amendment>;

export const AmendmentChange = z.enum([
  'create',
  'edit',
  'carry_forward',
  'needs_reanchor',
  'reanchor',
  'withdraw',
  'restore',
  'dismiss',
]);
export type AmendmentChange = z.infer<typeof AmendmentChange>;

/**
 * One immutable revision of an amendment (`amendment_revisions`, 0016, append-only). The head row in
 * `amendments` is changed only together with a new revision row, in one transaction. `base_rev` is the
 * revision this one was written on top of (NULL for r1).
 */
export const AmendmentRevision = z
  .object({
    amendment_id: Id,
    rev: z.number().int().min(1),
    base_rev: z.number().int().min(1).nullable(),
    change: AmendmentChange,
    /** The reviewer, or `scan:<run id>` for an automatic carry-forward. */
    author: z.string().min(1),
    status: AmendmentStatus,
    target_kind: AmendmentTargetKind,
    target_id: z.string().min(1),
    text: z.string().nullable(),
    anchor_fingerprint: z.string().nullable(),
    anchor_route_template: z.string().nullable(),
    anchor_element: AmendmentAnchorElement.nullable(),
    /** Why, e.g. `element_removed: the link "Zaloguj się" is gone`. */
    reason: z.string().nullable(),
    /** The scan that caused a carry-forward or a needs-reanchor. */
    run_id: Id.nullable(),
    created_at: Timestamp,
  })
  .superRefine((r, ctx) => {
    if ((r.rev === 1) !== (r.base_rev === null))
      ctx.addIssue({
        code: 'custom',
        path: ['base_rev'],
        message: 'base_rev is NULL for r1 and set for every later revision',
      });
  });
export type AmendmentRevision = z.infer<typeof AmendmentRevision>;
