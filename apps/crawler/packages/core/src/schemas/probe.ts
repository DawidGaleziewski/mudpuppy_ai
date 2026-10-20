import { z } from 'zod';
import { EvidenceRef, Id, Timestamp } from './common.js';

/** Spec 032 (migrations 0022, 0023): form steps, form probes and the trace suites built from them. */

/** `states.state_kind` (0022). `temporary` and `blocked` are outcome kinds, never state kinds. */
export const StateKind = z.enum(['main', 'validation', 'technical']);
export type StateKind = z.infer<typeof StateKind>;

/** `probe_outcomes.outcome_kind` (0023). */
export const OutcomeKind = z.enum([
  'next',
  'branch',
  'validation',
  'technical',
  'temporary',
  'blocked',
]);
export type OutcomeKind = z.infer<typeof OutcomeKind>;

/** `probe_outcomes.probe_group` (0023). */
export const ProbeGroup = z.enum(['validation', 'branch', 'technical']);
export type ProbeGroup = z.infer<typeof ProbeGroup>;

/** `probe_outcomes.fault` (0023): the technical fault a probe injected. */
export const ProbeFault = z.enum(['block_request', 'http_500', 'delay', 'offline']);
export type ProbeFault = z.infer<typeof ProbeFault>;

/** `probe_suites.status` (0023). */
export const ProbeSuiteStatus = z.enum(['open', 'approved', 'dismissed']);
export type ProbeSuiteStatus = z.infer<typeof ProbeSuiteStatus>;

/** `form_steps` (0022): one step of a form flow on a route template, numbered in first-seen order. */
export const FormStepRow = z.object({
  id: Id,
  portal_id: z.string().min(1),
  route_template: z.string().min(1),
  step_index: z.number().int().min(1),
  form_name: z.string().nullable(),
  /** Sorted `role|name` of the step's controls (the union of what was seen). */
  controls_json: z.array(z.string()),
  label: z.string().min(1),
  first_seen_run: Id,
  created_at: Timestamp,
});
export type FormStepRow = z.infer<typeof FormStepRow>;

const ProbeMessage = z.object({
  /** Null when the page did not tie the message to a field. */
  field: z.string().nullable(),
  text: z.string(),
  source: z.enum(['dom', 'native']),
});

const ProbePathStep = z.object({
  name: z.string(),
  kind: z.string(),
  value: z.string().optional(),
});

/** `probe_outcomes` (0023): what one form probe did. JSON columns are parsed here (stored as TEXT). */
export const ProbeOutcomeRow = z.object({
  id: Id,
  run_id: Id,
  from_state_id: Id,
  form_step_id: Id.nullable(),
  probe_id: z.string().min(1),
  probe_group: ProbeGroup,
  target: z.string().nullable(),
  inputs_json: z.array(z.unknown()),
  path_json: z.object({ start_url: z.string(), steps: z.array(ProbePathStep) }),
  fault: ProbeFault.nullable(),
  outcome_kind: OutcomeKind,
  to_state_id: Id.nullable(),
  accepted: z.union([z.literal(0), z.literal(1)]),
  possible_new_process: z.union([z.literal(0), z.literal(1)]),
  messages_json: z.array(ProbeMessage),
  http_status: z.number().int().nullable(),
  reason: z.string().nullable(),
  evidence_ref: EvidenceRef,
  transition_id: Id.nullable(),
  created_at: Timestamp,
});
export type ProbeOutcomeRow = z.infer<typeof ProbeOutcomeRow>;

/** `probe_suites` (0023): a proposed trace entry built from probe outcomes, decided by the owner. */
export const ProbeSuiteRow = z
  .object({
    id: Id,
    portal_id: z.string().min(1),
    run_id: Id,
    form_step_id: Id.nullable(),
    /** One `TraceSpecEntry` (the `traces.yaml` shape); validated by the traces schema, opaque here. */
    trace_json: z.record(z.string(), z.unknown()),
    notes_json: z.array(z.object({ variant: z.string(), probe_outcome_id: Id, why: z.string() })),
    status: ProbeSuiteStatus,
    approved_json: z.unknown().nullable(),
    replaced_json: z.unknown().nullable(),
    decided_by: z.string().nullable(),
    decided_at: Timestamp.nullable(),
    created_at: Timestamp,
  })
  .refine((r) => r.status === 'open' || r.decided_at !== null, {
    message: 'a decided suite has decided_at',
  })
  .refine((r) => r.status !== 'approved' || r.approved_json != null, {
    message: 'an approved suite has approved_json',
  });
export type ProbeSuiteRow = z.infer<typeof ProbeSuiteRow>;

/** `marks.kind` (0024). Only `probe` is written in spec 032; the rest are for R-69 (5) and R-66. */
export const MarkKind = z.enum(['start', 'focus', 'probe', 'retry', 'recheck', 'skip']);
export type MarkKind = z.infer<typeof MarkKind>;

/** `marks.target_kind` (0024): what `target_id` points at (no foreign key; polymorphic). */
export const MarkTargetKind = z.enum(['form_step', 'state', 'transition']);
export type MarkTargetKind = z.infer<typeof MarkTargetKind>;

/** `marks` (0024): a person's instruction on a map target for the next scan. */
export const MarkRow = z
  .object({
    id: Id,
    portal_id: z.string().min(1),
    kind: MarkKind,
    target_kind: MarkTargetKind,
    target_id: z.string().min(1),
    created_by: z.string().min(1),
    created_at: Timestamp,
    /** Set when a scan used the mark; an open mark has neither. */
    used_by_run_id: Id.nullable(),
    used_at: Timestamp.nullable(),
  })
  .refine((r) => (r.used_by_run_id === null) === (r.used_at === null), {
    message: 'used_by_run_id and used_at are set together',
  });
export type MarkRow = z.infer<typeof MarkRow>;
