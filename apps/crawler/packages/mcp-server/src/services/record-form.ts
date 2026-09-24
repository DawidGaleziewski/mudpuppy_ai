import { Confidence, newId, nowIso } from '@pathfinder/core';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { ToolError, parseInput } from '../errors.js';
import { getRun, requireEvidenceAndConfidence } from './common.js';

/** FR-011: per-field shape only; values are never recorded. */
export const FieldSchema = z
  .object({
    name: z.string(),
    type: z.string().min(1),
    required: z.boolean().default(false),
    constraints: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    options: z.array(z.string()).optional(),
    validation_messages: z.array(z.string()).optional(),
  })
  .strict();

export const RecordFormInput = z
  .object({
    run_id: z.string().min(1),
    state_id: z.string().min(1),
    fields: z.array(FieldSchema),
    evidence_ref: z.string().min(1),
    confidence: Confidence,
  })
  .strict();

export async function recordForm(ctx: ServerContext, raw: unknown): Promise<{ form_id: string }> {
  requireEvidenceAndConfidence(raw);
  const input = parseInput(RecordFormInput, raw);
  const run = await getRun(ctx, input.run_id);
  const state = await ctx.db
    .selectFrom('states')
    .select('id')
    .where('id', '=', input.state_id)
    .where('portal_id', '=', run.portal_id)
    .executeTakeFirst();
  if (!state)
    throw new ToolError(
      'UNKNOWN_REF',
      `state ${input.state_id} is not a state of portal ${run.portal_id}`,
    );
  const id = newId();
  await ctx.db
    .insertInto('forms')
    .values({
      id,
      run_id: input.run_id,
      state_id: input.state_id,
      fields_json: JSON.stringify(input.fields),
      evidence_ref: input.evidence_ref,
      confidence: input.confidence,
      created_at: nowIso(),
    })
    .execute();
  return { form_id: id };
}
