import { z } from 'zod';
import { Id, Timestamp } from './common.js';

export const ProcessStatus = z.enum(['recorded', 'replay_verified', 'documented']);
export type ProcessStatus = z.infer<typeof ProcessStatus>;

export const ProcessOutcome = z.enum(['goal_reached', 'boundary_reached', 'stopped', 'abandoned']);
export type ProcessOutcome = z.infer<typeof ProcessOutcome>;

/** One process per trace run (data-model.md "Process"); written by the crawler server. */
export const Process = z
  .object({
    id: Id,
    run_id: Id,
    portal_id: z.string().min(1),
    persona_id: z.string().min(1),
    name: z.string().min(1),
    goal: z.string().min(1),
    followup_record_id: Id.nullable(),
    status: ProcessStatus,
    /** NULL while the run is running. */
    outcome: ProcessOutcome.nullable(),
    boundary_action_id: Id.nullable(),
    observed_result: z.string().nullable(),
    not_observable: z.string().min(1).nullable(),
    created_at: Timestamp,
    ended_at: Timestamp.nullable(),
  })
  .refine(
    (p) =>
      p.outcome !== 'boundary_reached' ||
      (p.boundary_action_id !== null && p.not_observable !== null),
    {
      message:
        'boundary_action_id and not_observable are required when outcome is boundary_reached',
      path: ['boundary_action_id'],
    },
  );
export type Process = z.infer<typeof Process>;
