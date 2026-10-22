import { looksLikeRawPayload, newId, nowIso } from '@mudpuppy/core';
import { schemaHash } from '@mudpuppy/model';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { ToolError, parseInput } from '../errors.js';
import { getRun } from './common.js';

export const RecordApiCallInput = z
  .object({
    run_id: z.string().min(1),
    transition_id: z.string().min(1).nullable().default(null),
    method: z.string().min(1),
    url_template: z.string().min(1),
    status: z.number().int(),
    req_schema: z.unknown(),
    res_schema: z.unknown(),
    console_errors: z.array(z.string()).default([]),
    /**
     * The verbatim request URL (spec 019, R-37): kept as the page asked for it, query and session ids
     * included; not checked for raw payloads like the shapes are ("capture everything").
     */
    url: z.string().min(1).nullable().default(null),
    /**
     * Sample bodies (spec 034 R-68, A-9): kept only outside production (the caller leaves them out
     * there), masked when the portal asks for it, at most 4096 characters. Unlike the shapes they
     * are raw data on purpose: the contracts export shows what was sent and returned per attempt.
     */
    req_sample: z.string().max(4096).nullable().default(null),
    res_sample: z.string().max(4096).nullable().default(null),
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
  if (input.transition_id !== null) {
    const e = await ctx.db
      .selectFrom('transitions')
      .select('id')
      .where('id', '=', input.transition_id)
      .where('run_id', '=', input.run_id)
      .executeTakeFirst();
    if (!e)
      throw new ToolError(
        'UNKNOWN_REF',
        `transition ${input.transition_id} does not exist in this run`,
      );
  }
  const id = newId();
  await ctx.db
    .insertInto('network_calls')
    .values({
      id,
      run_id: input.run_id,
      transition_id: input.transition_id,
      method: input.method.toUpperCase(),
      url_template: input.url_template,
      status: input.status,
      req_schema: JSON.stringify(input.req_schema ?? null),
      res_schema: JSON.stringify(input.res_schema ?? null),
      console_errors: JSON.stringify(input.console_errors),
      created_at: nowIso(),
      url: input.url,
      req_sample: input.req_sample,
      res_sample: input.res_sample,
      // The endpoint schema (spec 039 design § 5.3): a backend change shows as a new hash.
      schema_hash:
        input.res_schema === undefined || input.res_schema === null
          ? null
          : schemaHash(input.res_schema as Parameters<typeof schemaHash>[0]),
    })
    .execute();
  return { api_call_id: id };
}
