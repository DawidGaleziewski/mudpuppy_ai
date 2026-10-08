import { z } from 'zod';
import { Id, Timestamp } from '@pathfinder/core';

export const WorkflowStepName = z.enum(['scan', 'map', 'narrow', 'document', 'amend']);
export type WorkflowStepName = z.infer<typeof WorkflowStepName>;

/** todo -> pending -> in_progress -> done | failed; failed -> pending on retry. */
export const WorkflowStepStatus = z.enum([
  'todo',
  'pending',
  'in_progress',
  'done',
  'failed',
  'stopped', // the BA stopped the run on purpose (0010, spec 011 F-04)
]);
export type WorkflowStepStatus = z.infer<typeof WorkflowStepStatus>;

/** One step of a conversation's workflow (`workflow_steps`, 0008). */
export const WorkflowStep = z.object({
  id: Id,
  conversation_id: Id,
  portal_id: z.string().min(1),
  step: WorkflowStepName,
  status: WorkflowStepStatus,
  run_id: Id.nullable(),
  session_id: Id.nullable(),
  error_ref: z.string().nullable(),
  started_at: Timestamp.nullable(),
  finished_at: Timestamp.nullable(),
  updated_at: Timestamp,
});
export type WorkflowStep = z.infer<typeof WorkflowStep>;
