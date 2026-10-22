import { newId, nowIso } from '@mudpuppy/core';
import type { ServerContext } from '../../context.js';
import type { ProbeFormResult } from '../../runtime.js';
import type { RunRow } from '../../services/index.js';

/** Outcomes that are no probe try: the happy press and a step that could not be probed. */
export const NOT_TRIES = ['happy-path', 'step'];

/** The run's probe tries so far, against its budget. */
export async function outcomesInRun(ctx: ServerContext, runId: string): Promise<number> {
  const r = await ctx.db
    .selectFrom('probe_outcomes')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('run_id', '=', runId)
    .where('probe_id', 'not in', NOT_TRIES)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

export async function formStepOf(
  ctx: ServerContext,
  id: string | null,
): Promise<ProbeFormResult['form_step']> {
  if (id === null) return null;
  const r = await ctx.db
    .selectFrom('form_steps')
    .select(['id', 'step_index', 'label'])
    .where('id', '=', id)
    .executeTakeFirst();
  return r ?? null;
}

/** A step that could not be probed at all: one `blocked` outcome on the step's own evidence. */
export async function recordBlocked(
  ctx: ServerContext,
  run: RunRow,
  actionId: string,
  reason: string,
): Promise<void> {
  const action = await ctx.db
    .selectFrom('actions')
    .innerJoin('states', 'states.id', 'actions.state_id')
    .select(['actions.state_id', 'states.evidence_ref', 'states.form_step_id'])
    .where('actions.id', '=', actionId)
    .executeTakeFirstOrThrow();
  await ctx.db
    .insertInto('probe_outcomes')
    .values({
      id: newId(),
      run_id: run.id,
      from_state_id: action.state_id,
      form_step_id: action.form_step_id,
      probe_id: 'step',
      probe_group: 'validation',
      target: null,
      inputs_json: '[]',
      path_json: '{"start_url":"","steps":[]}',
      fault: null,
      outcome_kind: 'blocked',
      to_state_id: null,
      accepted: 0,
      possible_new_process: 0,
      messages_json: '[]',
      http_status: null,
      reason,
      evidence_ref: action.evidence_ref,
      transition_id: null,
      created_at: nowIso(),
    })
    .execute();
}
