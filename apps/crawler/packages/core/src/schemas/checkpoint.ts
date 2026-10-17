import { z } from 'zod';
import { Id, Timestamp } from './common.js';

/** Spec 034 (migration 0027): the recorded way back to a state. */

/** One field a step filled (the control's accessible name, its kind, and the value typed, if any). */
const CheckpointFill = z.object({
  name: z.string(),
  kind: z.string(),
  value: z.string().optional(),
});

/** One step of a checkpoint: the action taken, its value, and the state expected after it. */
export const CheckpointStep = z.object({
  action_id: Id,
  value: z.string().nullable(),
  fills: z.array(CheckpointFill).optional(),
  /** The state id expected after the step; a different state on replay means the way is broken. */
  to_state: Id,
});
export type CheckpointStep = z.infer<typeof CheckpointStep>;

/**
 * `checkpoints` (0027): one per (run, state), the shortest way the run took (the app overwrites it
 * when it finds a shorter one). `steps_json` is stored as TEXT (JSON array); an empty array means the
 * state opens directly by `start_url`.
 */
export const CheckpointRow = z.object({
  id: Id,
  run_id: Id,
  state_id: Id,
  /** The URL of the last navigate before the steps. */
  start_url: z.string().min(1),
  steps_json: z.array(CheckpointStep),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type CheckpointRow = z.infer<typeof CheckpointRow>;
