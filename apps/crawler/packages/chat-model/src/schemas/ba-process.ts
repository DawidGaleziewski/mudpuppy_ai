import { z } from 'zod';
import { Id, Timestamp } from '@mudpuppy/core';

/**
 * The BA's cut of the portal (`ba_processes` and its tables, 0018, spec 022 data-model.md M5). Distinct from
 * the crawler's trace `processes` (spec 004) and from `process_scopes` (spec 010). Head rows carry the current
 * revision number; `*_revisions` rows are append-only. None is a Layer B evidence record: no
 * evidence_ref/confidence.
 */

export const BaProcessStage = z.enum([
  'scoped',
  'as_is_documented',
  'to_be_design',
  'migrating',
  'migrated',
]);
export type BaProcessStage = z.infer<typeof BaProcessStage>;

export const BaProcessSource = z.enum(['suggestion', 'scope', 'new']);
export type BaProcessSource = z.infer<typeof BaProcessSource>;

/** `archive` / `unarchive`: 0028, spec 027 (a process is archived, never deleted). */
export const BaProcessChange = z.enum([
  'create',
  'rename',
  'stage',
  'restore',
  'archive',
  'unarchive',
  'merge',
  'unmerge',
]);
export type BaProcessChange = z.infer<typeof BaProcessChange>;

export const ProcessModelKind = z.enum(['as_is', 'to_be']);
export type ProcessModelKind = z.infer<typeof ProcessModelKind>;

/** `edit`: a person changed A's steps (0028, spec 027 FR-004). */
export const ProcessModelChange = z.enum([
  'create',
  'branch',
  'save',
  'restore',
  'observe',
  'edit',
  'scope',
  'merge',
  'unmerge',
]);
export type ProcessModelChange = z.infer<typeof ProcessModelChange>;

/** An environment name as the portal declares it (free names, spec 030 R-61). */
export const ProcessLiveEnvironment = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,39}$/, 'must be a short lowercase name');
export type ProcessLiveEnvironment = z.infer<typeof ProcessLiveEnvironment>;

export const GroupingSuggestionStatus = z.enum(['open', 'accepted', 'dismissed']);
export type GroupingSuggestionStatus = z.infer<typeof GroupingSuggestionStatus>;

/** A note on a step (`steps[].annotations[]`). */
export const ProcessStepAnnotation = z.object({
  text: z.string(),
  author: z.string(),
  at: z.string(),
});
export type ProcessStepAnnotation = z.infer<typeof ProcessStepAnnotation>;

/**
 * One step of a process model (element of the `steps` JSON array). `observed` steps point at a recorded
 * state; drawn steps have none. `from` names the steps of the model it was branched from that this step
 * replaces (one = changed, two or more = merged). Ids are unique within a model and kept across its
 * revisions.
 */
export const ProcessStep = z.object({
  id: z.string().min(1),
  title: z.string(),
  route: z.string(),
  state_id: z.string().min(1).nullable(),
  screen_id: z.string().min(1).nullable(),
  observed: z.boolean(),
  from: z.array(z.string().min(1)),
  annotations: z.array(ProcessStepAnnotation),
});
export type ProcessStep = z.infer<typeof ProcessStep>;

/** Head of a BA process; `key` is `PRC-nnn`, unique per portal. */
export const BaProcess = z.object({
  id: Id,
  portal_id: z.string().min(1),
  key: z.string().regex(/^PRC-\d{3}/),
  name: z.string().min(1),
  /** The persona the as-is was observed as. */
  persona: z.string().min(1),
  stage: BaProcessStage,
  /** The head's current process revision. */
  rev: z.number().int().min(1),
  source: BaProcessSource,
  /** The `process_scopes` row it was migrated from. */
  scope_id: Id.nullable(),
  /** The accepted grouping suggestion. */
  suggestion_id: Id.nullable(),
  created_at: Timestamp,
  updated_at: Timestamp,
  /** Set while archived (0028): hidden from the list, every row kept. */
  archived_at: Timestamp.nullable(),
  /** The BA `process` record (PROC-nnn) it was opened from (0028, spec 027 US6). */
  record_key: z
    .string()
    .regex(/^PROC-\d/)
    .nullable(),
});
export type BaProcess = z.infer<typeof BaProcess>;

/** `base_rev` is NULL exactly for rev 1 (the table CHECK). */
const revisionChain = (r: { rev: number; base_rev: number | null }, ctx: z.RefinementCtx) => {
  if ((r.rev === 1) !== (r.base_rev === null))
    ctx.addIssue({
      code: 'custom',
      path: ['base_rev'],
      message: 'base_rev must be null exactly for rev 1',
    });
};

export const BaProcessRevision = z
  .object({
    process_id: Id,
    rev: z.number().int().min(1),
    base_rev: z.number().int().min(1).nullable(),
    change: BaProcessChange,
    author: z.string().min(1),
    /** The name and stage after the change. */
    name: z.string().min(1),
    stage: BaProcessStage,
    /** The A revision a `stage` change signed off (0028, spec 027 FR-005). */
    as_is_rev: z.number().int().min(1).nullable(),
    created_at: Timestamp,
  })
  .superRefine(revisionChain);
export type BaProcessRevision = z.infer<typeof BaProcessRevision>;

/** Head of a process model; label `A`, `B`, ... unique per process (0039: was "variant"). */
export const ProcessModel = z
  .object({
    id: Id,
    process_id: Id,
    label: z.string().min(1),
    kind: ProcessModelKind,
    rev: z.number().int().min(1),
    branched_from_model_id: Id.nullable(),
    branched_from_rev: z.number().int().min(1).nullable(),
    created_at: Timestamp,
  })
  .superRefine((v, ctx) => {
    if ((v.branched_from_model_id === null) !== (v.branched_from_rev === null))
      ctx.addIssue({
        code: 'custom',
        path: ['branched_from_rev'],
        message: 'branched_from_model_id and branched_from_rev are set together',
      });
  });
export type ProcessModel = z.infer<typeof ProcessModel>;

export const ProcessModelRevision = z
  .object({
    model_id: Id,
    rev: z.number().int().min(1),
    base_rev: z.number().int().min(1).nullable(),
    change: ProcessModelChange,
    /** A reviewer name, or `scan:<run id>` for `observe`. */
    author: z.string().min(1),
    steps: z.array(ProcessStep),
    /** The one line the history shows. */
    note: z.string().nullable(),
    run_id: Id.nullable(),
    restored_from: z.number().int().min(1).nullable(),
    created_at: Timestamp,
  })
  .superRefine(revisionChain);
export type ProcessModelRevision = z.infer<typeof ProcessModelRevision>;

/** Scratch: one open draft of one person over one to-be model, updated in place. */
export const ProcessDraft = z.object({
  model_id: Id,
  author: z.string().min(1),
  base_rev: z.number().int().min(1),
  steps: z.array(ProcessStep),
  updated_at: Timestamp,
});
export type ProcessDraft = z.infer<typeof ProcessDraft>;

/** The live process model per environment is the newest row for (process_id, environment). */
export const ProcessLive = z.object({
  id: Id,
  process_id: Id,
  environment: ProcessLiveEnvironment,
  model_id: Id,
  model_rev: z.number().int().min(1),
  author: z.string().min(1),
  reason: z.string().nullable(),
  created_at: Timestamp,
});
export type ProcessLive = z.infer<typeof ProcessLive>;

/**
 * A screen added to a process's scope that no observed move reaches yet (0051, spec 078 T-05): in the scope,
 * in no step of A. Open while `removed_at` is null; `removed_by` is set with it.
 */
export const ProcessScopeScreen = z
  .object({
    id: Id,
    process_id: Id,
    state_id: Id,
    author: z.string().min(1),
    added_at: Timestamp,
    removed_at: Timestamp.nullable(),
    removed_by: z.string().nullable(),
  })
  .superRefine((v, ctx) => {
    if ((v.removed_at === null) !== (v.removed_by === null))
      ctx.addIssue({
        code: 'custom',
        path: ['removed_by'],
        message: 'removed_at and removed_by are set together',
      });
  });
export type ProcessScopeScreen = z.infer<typeof ProcessScopeScreen>;

/** One to-be model the absorbed process had, moved over to the kept process (`moved_json`, 0051). */
export const ProcessMergeMoved = z.object({
  model_id: Id,
  from_label: z.string().min(1),
  to_label: z.string().min(1),
});
export type ProcessMergeMoved = z.infer<typeof ProcessMergeMoved>;

/**
 * One merge of two saved processes of the same persona (0051, spec 078 T-06): the kept one absorbs the other.
 * Enough to put everything back (Undo in 10 s, Split back later). One open merge per absorbed process.
 */
export const ProcessMerge = z
  .object({
    id: Id,
    portal_id: z.string().min(1),
    kept_process_id: Id,
    absorbed_process_id: Id,
    author: z.string().min(1),
    reason: z.string().nullable(),
    /** The kept process's name before (the dialog may rename it). */
    kept_name_before: z.string().min(1),
    /** A's head before the merge, and the A revision the merge wrote. */
    kept_as_is_rev_before: z.number().int().min(1),
    kept_as_is_rev_after: z.number().int().min(1),
    moved_json: z.array(ProcessMergeMoved),
    created_at: Timestamp,
    undone_at: Timestamp.nullable(),
    undone_by: z.string().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.kept_process_id === v.absorbed_process_id)
      ctx.addIssue({
        code: 'custom',
        path: ['absorbed_process_id'],
        message: 'a process cannot absorb itself',
      });
    if ((v.undone_at === null) !== (v.undone_by === null))
      ctx.addIssue({
        code: 'custom',
        path: ['undone_by'],
        message: 'undone_at and undone_by are set together',
      });
  });
export type ProcessMerge = z.infer<typeof ProcessMerge>;

export const GroupingSuggestion = z
  .object({
    id: Id,
    portal_id: z.string().min(1),
    name: z.string().min(1),
    persona: z.string().min(1),
    /** Ordered as-is steps, all observed. */
    steps: z.array(ProcessStep),
    /** The assistant's reason. */
    why: z.string().min(1),
    /** The sorted state ids joined with `,`; a suggestion with a dismissed key is refused (FR-007). */
    screens_key: z.string().min(1),
    status: GroupingSuggestionStatus,
    conversation_id: Id.nullable(),
    /** Set on accept. */
    process_id: Id.nullable(),
    decided_by: z.string().nullable(),
    decided_at: Timestamp.nullable(),
    created_at: Timestamp,
  })
  .superRefine((s, ctx) => {
    if (s.status !== 'open' && s.decided_at === null)
      ctx.addIssue({ code: 'custom', path: ['decided_at'], message: 'required once decided' });
    if (s.status === 'accepted' && s.process_id === null)
      ctx.addIssue({ code: 'custom', path: ['process_id'], message: 'required when accepted' });
  });
export type GroupingSuggestion = z.infer<typeof GroupingSuggestion>;

/** A section is a string or an array of strings. */
const ChangeSpecSection = z.union([z.string(), z.array(z.string())]);

/** The sections of a change spec (`change_spec_revisions.sections`, a JSON object). */
export const ChangeSpecSections = z.object({
  scope: ChangeSpecSection,
  as_is: ChangeSpecSection,
  to_be: ChangeSpecSection,
  delta: ChangeSpecSection,
  records: ChangeSpecSection,
  migration_cut: ChangeSpecSection,
  open_questions: ChangeSpecSection,
});
export type ChangeSpecSections = z.infer<typeof ChangeSpecSections>;

export const ChangeSpecRevision = z
  .object({
    process_id: Id,
    rev: z.number().int().min(1),
    base_rev: z.number().int().min(1).nullable(),
    left_model_id: Id,
    left_rev: z.number().int().min(1),
    right_model_id: Id,
    right_rev: z.number().int().min(1),
    sections: ChangeSpecSections,
    author: z.string().min(1),
    /** The doc record key when saved to Docs. */
    doc_key: z.string().min(1).nullable(),
    created_at: Timestamp,
  })
  .superRefine(revisionChain);
export type ChangeSpecRevision = z.infer<typeof ChangeSpecRevision>;
