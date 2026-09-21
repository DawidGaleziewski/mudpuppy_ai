import { looksLikeRawPayload, newId, nowIso } from '@pathfinder/core';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { ToolError, parseInput } from '../errors.js';
import { getRun } from './common.js';

export const RecordApiCallInput = z
  .object({
    run_id: z.string().min(1),
    edge_id: z.string().min(1).nullable().default(null),
    method: z.string().min(1),
    url_template: z.string().min(1),
    status: z.number().int(),
    req_schema: z.unknown(),
    res_schema: z.unknown(),
    console_errors: z.array(z.string()).default([]),
  })
  .strict();

/** Shape-only records: a payload that looks like raw PII is rejected, never silently stored (FR-012, FR-014). */
export async function recordApiCall(
  ctx: ServerContext,
  raw: unknown,
): Promise<{ api_call_id: string }> {
  const input = parseInput(RecordApiCallInput, raw);
  await getRun(ctx, input.run_id);
  if (
    looksLikeRawPayload(input.req_schema) ||
    looksLikeRawPayload(input.res_schema) ||
    looksLikeRawPayload(input.url_template)
  ) {
    throw new ToolError(
      'PII_SUSPECTED',
      'req_schema/res_schema/url_template look like raw data; record the shape only',
    );
  }
  if (input.edge_id !== null) {
    const e = await ctx.db
      .selectFrom('edges')
      .select('id')
      .where('id', '=', input.edge_id)
      .where('run_id', '=', input.run_id)
      .executeTakeFirst();
    if (!e) throw new ToolError('UNKNOWN_REF', `edge ${input.edge_id} does not exist in this run`);
  }
  const id = newId();
  await ctx.db
    .insertInto('network_calls')
    .values({
      id,
      run_id: input.run_id,
      edge_id: input.edge_id,
      method: input.method.toUpperCase(),
      url_template: input.url_template,
      status: input.status,
      req_schema: JSON.stringify(input.req_schema ?? null),
      res_schema: JSON.stringify(input.res_schema ?? null),
      console_errors: JSON.stringify(input.console_errors),
      created_at: nowIso(),
    })
    .execute();
  return { api_call_id: id };
}
