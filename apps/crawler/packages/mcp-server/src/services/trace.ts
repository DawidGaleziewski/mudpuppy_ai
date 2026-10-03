import { maskText, newId, nowIso } from '@pathfinder/core';
import type { ServerContext } from '../context.js';
import { ToolError } from '../errors.js';

/**
 * Trace mode (spec 004 R-14, research §10–11): one `processes` row per trace run, one `process_steps`
 * row per executed call, and the follow-up task lifecycle. Everything here is written by the server
 * from what it observed; the agent supplies only the process name/goal, step intents and synthetic
 * values.
 */

export type StepKind = 'navigate' | 'click' | 'fill' | 'check' | 'select';
export type ProcessOutcome = 'goal_reached' | 'boundary_reached' | 'stopped' | 'abandoned';

export interface ProcessRow {
  id: string;
  run_id: string;
  followup_record_id: string | null;
  outcome: string | null;
}

/** The trace process of a run, or undefined for a map run. */
export async function processOfRun(
  ctx: ServerContext,
  runId: string,
): Promise<ProcessRow | undefined> {
  return ctx.db
    .selectFrom('processes')
    .select(['id', 'run_id', 'followup_record_id', 'outcome'])
    .where('run_id', '=', runId)
    .executeTakeFirst();
}

/**
 * Resolve `followup_key` to an `open` follow-up record of the portal (`UNKNOWN_REF` otherwise).
 * Returns the record id; nothing is changed until the run row exists.
 */
export async function openFollowup(
  ctx: ServerContext,
  portalId: string,
  key: string,
): Promise<string> {
  const row = await ctx.db
    .selectFrom('doc_records')
    .innerJoin('followup_tasks', 'followup_tasks.record_id', 'doc_records.id')
    .select(['doc_records.id', 'followup_tasks.status'])
    .where('doc_records.portal_id', '=', portalId)
    .where('doc_records.kind', '=', 'followup')
    .where('doc_records.key', '=', key)
    .executeTakeFirst();
  if (!row) throw new ToolError('UNKNOWN_REF', `${key} is not a follow-up of portal ${portalId}`);
  if (row.status !== 'open')
    throw new ToolError(
      'UNKNOWN_REF',
      `${key} is ${row.status}; only an open follow-up can be traced`,
    );
  return row.id;
}

/** Create the process of a new trace run; a linked follow-up becomes `in_progress` with this run. */
export async function createProcess(
  ctx: ServerContext,
  input: {
    run_id: string;
    portal_id: string;
    persona_id: string;
    name: string;
    goal: string;
    followup_record_id: string | null;
  },
): Promise<string> {
  const id = newId();
  await ctx.db
    .insertInto('processes')
    .values({
      id,
      run_id: input.run_id,
      portal_id: input.portal_id,
      persona_id: input.persona_id,
      name: maskText(input.name),
      goal: maskText(input.goal),
      followup_record_id: input.followup_record_id,
      status: 'recorded',
      outcome: null,
      boundary_action_id: null,
      observed_result: null,
      not_observable: null,
      created_at: nowIso(),
      ended_at: null,
    })
    .execute();
  if (input.followup_record_id)
    await setFollowup(ctx, input.followup_record_id, 'in_progress', input.run_id, null);
  return id;
}

/** Append the next step (ord = count + 1). Returns its ord. */
export async function appendStep(
  ctx: ServerContext,
  processId: string,
  step: {
    intent: string;
    kind: StepKind;
    action_id: string | null;
    edge_id: string | null;
    value: string | null;
    state_before: string | null;
    state_after: string | null;
    outcomes: string[];
    evidence_ref: string;
  },
): Promise<number> {
  const last = await ctx.db
    .selectFrom('process_steps')
    .select((eb) => eb.fn.max('ord').as('n'))
    .where('process_id', '=', processId)
    .executeTakeFirst();
  const ord = Number(last?.n ?? 0) + 1;
  await ctx.db
    .insertInto('process_steps')
    .values({
      id: newId(),
      process_id: processId,
      ord,
      intent: maskText(step.intent),
      kind: step.kind,
      action_id: step.action_id,
      edge_id: step.edge_id,
      value: step.value === null ? null : maskText(step.value),
      state_before: step.state_before,
      state_after: step.state_after,
      outcomes_json: JSON.stringify(step.outcomes),
      evidence_ref: step.evidence_ref,
      confidence: 'observed',
      created_at: nowIso(),
    })
    .execute();
  return ord;
}

export async function stepCount(ctx: ServerContext, processId: string): Promise<number> {
  const r = await ctx.db
    .selectFrom('process_steps')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('process_id', '=', processId)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

/**
 * Close the process once (a closed process keeps its first outcome) and move a linked follow-up:
 * `goal_reached` → `done`, anything else → `blocked` with the reason.
 */
export async function closeProcess(
  ctx: ServerContext,
  processId: string,
  close: {
    outcome: ProcessOutcome;
    observed_result?: string | null;
    boundary_action_id?: string | null;
    not_observable?: string | null;
    /** Why a linked follow-up is blocked (rule, warning or the agent's result). */
    blocked_reason?: string;
  },
): Promise<void> {
  const proc = await ctx.db
    .selectFrom('processes')
    .select(['run_id', 'followup_record_id', 'outcome'])
    .where('id', '=', processId)
    .executeTakeFirstOrThrow();
  if (proc.outcome !== null) return;
  await ctx.db
    .updateTable('processes')
    .set({
      outcome: close.outcome,
      observed_result:
        close.observed_result === undefined || close.observed_result === null
          ? null
          : maskText(close.observed_result),
      boundary_action_id: close.boundary_action_id ?? null,
      not_observable: close.not_observable ?? null,
      ended_at: nowIso(),
    })
    .where('id', '=', processId)
    .execute();
  if (!proc.followup_record_id) return;
  if (close.outcome === 'goal_reached')
    await setFollowup(ctx, proc.followup_record_id, 'done', proc.run_id, null);
  else
    await setFollowup(
      ctx,
      proc.followup_record_id,
      'blocked',
      proc.run_id,
      maskText(close.blocked_reason ?? close.outcome),
    );
}

async function setFollowup(
  ctx: ServerContext,
  recordId: string,
  status: 'in_progress' | 'done' | 'blocked',
  runId: string,
  blockedReason: string | null,
): Promise<void> {
  await ctx.db
    .updateTable('followup_tasks')
    .set({ status, run_id: runId, blocked_reason: blockedReason, updated_at: nowIso() })
    .where('record_id', '=', recordId)
    .execute();
}
