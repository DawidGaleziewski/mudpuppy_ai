import { NavigationHop, PageVisitVia, newId, nowIso } from '@pathfinder/core';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { parseInput } from '../errors.js';

export const RecordPageVisitInput = z
  .object({
    run_id: z.string().min(1),
    state_id: z.string().min(1),
    edge_id: z.string().min(1).nullable(),
    via: PageVisitVia,
    url: z.string().min(1),
    hops: z.array(NavigationHop),
  })
  .strict();
export type RecordPageVisitInput = z.input<typeof RecordPageVisitInput>;

/**
 * One arrival on a page (spec 019, table `page_visits`): the verbatim URL and the hops that led to
 * it. Every arrival is a row, also on a state the run already knows: the second URL a screen is
 * reached under is exactly what R-38 wants recorded.
 */
export async function recordPageVisit(
  ctx: ServerContext,
  raw: RecordPageVisitInput,
): Promise<{ visit_id: string }> {
  const input = parseInput(RecordPageVisitInput, raw);
  const id = newId();
  await ctx.db
    .insertInto('page_visits')
    .values({
      id,
      run_id: input.run_id,
      state_id: input.state_id,
      edge_id: input.edge_id,
      via: input.via,
      url: input.url,
      hops_json: JSON.stringify(input.hops),
      created_at: nowIso(),
    })
    .execute();
  return { visit_id: id };
}
