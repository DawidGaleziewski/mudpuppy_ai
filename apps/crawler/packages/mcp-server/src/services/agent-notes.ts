import { maskText, newId, nowIso } from '@pathfinder/core';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { ToolError, parseInput } from '../errors.js';
import { assertRunActive, getRun } from './common.js';
import { resolveRef } from './refs.js';

export const GetKnownStatesInput = z
  .object({ run_id: z.string().min(1), cluster_id: z.string().min(1).optional() })
  .strict();

/** Read-only: the states this run has seen, optionally narrowed to one cluster. */
export async function getKnownStates(ctx: ServerContext, raw: unknown) {
  const input = parseInput(GetKnownStatesInput, raw);
  await getRun(ctx, input.run_id);
  let q = ctx.db
    .selectFrom('state_observations')
    .innerJoin('states', 'states.id', 'state_observations.state_id')
    .select(['states.id', 'states.cluster_id', 'states.route_template', 'states.title'])
    .where('state_observations.run_id', '=', input.run_id)
    .orderBy('states.id');
  if (input.cluster_id) q = q.where('states.cluster_id', '=', input.cluster_id);
  return { states: await q.execute() };
}

const NoteInput = z
  .object({
    run_id: z.string().min(1),
    text: z.string().trim().min(1).max(2000),
    about_ref: z.string().min(1),
  })
  .strict();

/** Intent and unexplained behaviour go here, never into a rule candidate (FR-002). */
export async function addOpenQuestion(
  ctx: ServerContext,
  raw: unknown,
): Promise<{ open_question_id: string }> {
  const input = parseInput(NoteInput, raw);
  await assertRunActive(ctx, input.run_id);
  if (!(await resolveRef(ctx, input.run_id, input.about_ref))) {
    throw new ToolError(
      'UNKNOWN_REF',
      `about_ref ${input.about_ref} is not a state, edge or form of this run`,
    );
  }
  const id = newId();
  await ctx.db
    .insertInto('open_questions')
    .values({
      id,
      run_id: input.run_id,
      text: maskText(input.text),
      about_ref: input.about_ref,
      status: 'open',
      created_at: nowIso(),
    })
    .execute();
  return { open_question_id: id };
}

/** The server copies the referenced record's evidence_ref and forces `inferred`; the agent sets neither. */
export async function addRuleCandidate(
  ctx: ServerContext,
  raw: unknown,
): Promise<{ rule_candidate_id: string }> {
  const input = parseInput(NoteInput, raw);
  await assertRunActive(ctx, input.run_id);
  const ref = await resolveRef(ctx, input.run_id, input.about_ref);
  if (!ref)
    throw new ToolError(
      'UNKNOWN_REF',
      `about_ref ${input.about_ref} is not a state, edge or form of this run`,
    );
  const id = newId();
  await ctx.db
    .insertInto('rule_candidates')
    .values({
      id,
      run_id: input.run_id,
      text: maskText(input.text),
      about_ref: input.about_ref,
      evidence_ref: ref.evidence_ref,
      confidence: 'inferred',
      created_at: nowIso(),
    })
    .execute();
  return { rule_candidate_id: id };
}
