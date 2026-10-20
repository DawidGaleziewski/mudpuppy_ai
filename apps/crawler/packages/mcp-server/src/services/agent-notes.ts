import { maskText, newId, nowIso } from '@pathfinder/core';
import {
  CRAWLER_HYPOTHESIS_KINDS,
  HypothesisInputError,
  HypothesisTestInput,
  proposeHypothesis,
  reconcilePortalModel,
} from '@pathfinder/store';
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

/** Intent and unexplained behaviour go here, never into a hypothesis's facts (FR-002). */
export async function addOpenQuestion(
  ctx: ServerContext,
  raw: unknown,
): Promise<{ open_question_id: string }> {
  const input = parseInput(NoteInput, raw);
  await assertRunActive(ctx, input.run_id);
  if (!(await resolveRef(ctx, input.run_id, input.about_ref))) {
    throw new ToolError(
      'UNKNOWN_REF',
      `about_ref ${input.about_ref} is not a state, transition or form of this run`,
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

export const AddHypothesisInput = z
  .object({
    run_id: z.string().min(1),
    kind: z.enum(CRAWLER_HYPOTHESIS_KINDS),
    claim: z.string().trim().min(1).max(600),
    about_ref: z.string().min(1),
    test: HypothesisTestInput.optional(),
  })
  .strict();

/**
 * The crawler's inference (spec 039 design § 10.4, replacing `add_rule_candidate`): a hypothesis
 * on the portal model with origin agent, citing the state, transition or form it is about, and a
 * test that could refute it. A run's first page may come before the portal has a model: the
 * model is built from what is recorded so far. Only a person confirms it.
 */
export async function addHypothesis(
  ctx: ServerContext,
  raw: unknown,
): Promise<{ key: string; created: boolean }> {
  const input = parseInput(AddHypothesisInput, raw);
  const run = await assertRunActive(ctx, input.run_id);
  const ref = await resolveRef(ctx, input.run_id, input.about_ref);
  if (!ref)
    throw new ToolError(
      'UNKNOWN_REF',
      `about_ref ${input.about_ref} is not a state, transition or form of this run`,
    );
  const evidence =
    ref.kind === 'form'
      ? {
          kind: 'state' as const,
          id: (
            ctx.raw.prepare('SELECT state_id FROM forms WHERE id = ?').get(input.about_ref) as {
              state_id: string;
            }
          ).state_id,
        }
      : { kind: ref.kind, id: input.about_ref };
  const hasModel = ctx.raw
    .prepare('SELECT 1 FROM model_versions WHERE portal_id = ? LIMIT 1')
    .get(run.portal_id);
  if (!hasModel) reconcilePortalModel(ctx.raw, run.portal_id);
  try {
    return proposeHypothesis(ctx.raw, {
      portal: run.portal_id,
      kind: input.kind,
      claim: maskText(input.claim),
      evidence: [evidence],
      tests: input.test ? [input.test] : [],
      actor: 'crawler',
    });
  } catch (e) {
    if (e instanceof HypothesisInputError) throw new ToolError(e.code, e.message);
    throw e;
  }
}
