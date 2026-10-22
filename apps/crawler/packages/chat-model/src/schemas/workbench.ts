import { z } from 'zod';
import { Id, Timestamp } from '@mudpuppy/core';

/**
 * The Workbench (generative UI beta) records of migration 0049, spec 043 (R-92). They hang off a
 * conversation (`chat_conversations.kind = 'workbench'`) and follow its portal. Written only by
 * `@mudpuppy/chat`. JSON columns are TEXT in the table and parsed values here. Not Layer B
 * evidence records: no evidence_ref/confidence.
 */
export const WorkbenchPath = z.enum(['chat', 'mapping', 'troubleshoot', 'explain']);
export type WorkbenchPath = z.infer<typeof WorkbenchPath>;

/** Who chose the path: the assistant, or the person (`you`). */
export const WorkbenchPathSource = z.enum(['assistant', 'you']);
export type WorkbenchPathSource = z.infer<typeof WorkbenchPathSource>;

/** Workbench state of a conversation (`workbench_conversations`). `title` NULL = untitled. */
export const WorkbenchConversation = z.object({
  conversation_id: Id,
  path: WorkbenchPath,
  path_source: WorkbenchPathSource,
  title: z.string().min(1).nullable(),
  updated_at: Timestamp,
});
export type WorkbenchConversation = z.infer<typeof WorkbenchConversation>;

/** One view spec the assistant produced (`workbench_views`); at most one per turn. */
export const WorkbenchView = z.object({
  id: Id,
  conversation_id: Id,
  turn: z.number().int().min(1),
  path: WorkbenchPath,
  why: z.string().min(1),
  /** The checked spec (a JSON object). */
  spec_json: z.record(z.string(), z.unknown()),
  /** The tool input as received (any JSON). */
  received_json: z.unknown(),
  dropped_json: z.array(z.unknown()),
  repaired_json: z.array(z.unknown()),
  /** True when the fallback view replaced the spec. */
  fallback: z.boolean(),
  created_at: Timestamp,
});
export type WorkbenchView = z.infer<typeof WorkbenchView>;

export const WorkbenchCommandName = z.enum([
  'scan.start',
  'scan.resume',
  'scan.stop',
  'path.attempt',
  'mark.add',
]);
export type WorkbenchCommandName = z.infer<typeof WorkbenchCommandName>;

export const WorkbenchCommandSource = z.enum(['assistant', 'button']);
export type WorkbenchCommandSource = z.infer<typeof WorkbenchCommandSource>;

/** proposed -> running -> done | failed -> undone; proposed -> cancelled | expired. */
export const WorkbenchCommandState = z.enum([
  'proposed',
  'running',
  'done',
  'failed',
  'cancelled',
  'expired',
  'undone',
]);
export type WorkbenchCommandState = z.infer<typeof WorkbenchCommandState>;

/**
 * A command proposal and, once confirmed, its audit record (`workbench_commands`). Nothing runs
 * before Confirm: a state past proposed/cancelled/expired needs `confirmed_at` and `confirmed_by`.
 * `token_hash` is the sha256 hex of the one-time confirm token; the token itself is never stored.
 */
export const WorkbenchCommand = z
  .object({
    id: Id,
    conversation_id: Id,
    turn: z.number().int().min(1),
    command: WorkbenchCommandName,
    args_json: z.record(z.string(), z.unknown()),
    reason: z.string().min(1),
    source: WorkbenchCommandSource,
    state: WorkbenchCommandState,
    token_hash: z.string().length(64),
    precondition_hash: z.string(),
    idempotency_key: z.string(),
    expires_at: Timestamp,
    confirmed_by: z.string().nullable(),
    confirmed_at: Timestamp.nullable(),
    /** A JSON object when set, e.g. the started run id. */
    result_json: z.record(z.string(), z.unknown()).nullable(),
    error_ref: z.string().nullable(),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .superRefine((c, ctx) => {
    const need = (ok: boolean, path: string, message: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [path], message });
    };
    if (!['proposed', 'cancelled', 'expired'].includes(c.state)) {
      need(c.confirmed_at !== null, 'confirmed_at', `${c.state} needs confirmed_at`);
      need(c.confirmed_by !== null, 'confirmed_by', `${c.state} needs confirmed_by`);
    }
    need(c.state !== 'done' || c.result_json !== null, 'result_json', 'done needs result_json');
    need(c.state !== 'failed' || c.error_ref !== null, 'error_ref', 'failed needs error_ref');
  });
export type WorkbenchCommand = z.infer<typeof WorkbenchCommand>;

export const WorkbenchFeedbackValue = z.enum(['yes', 'no']);
export type WorkbenchFeedbackValue = z.infer<typeof WorkbenchFeedbackValue>;

/** The reasons a person can give for "No" (kept in `reasons_json`, an array). */
export const WorkbenchFeedbackReason = z.enum([
  'wrong_path',
  'missing_something',
  'too_much',
  'wrong_data',
  'other',
]);
export type WorkbenchFeedbackReason = z.infer<typeof WorkbenchFeedbackReason>;

/** "Right view?": one answer per view per person (`workbench_feedback`), changeable. */
export const WorkbenchFeedback = z.object({
  view_id: Id,
  by: z.string().min(1),
  value: WorkbenchFeedbackValue,
  reasons_json: z.array(WorkbenchFeedbackReason),
  text: z.string().nullable(),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type WorkbenchFeedback = z.infer<typeof WorkbenchFeedback>;
