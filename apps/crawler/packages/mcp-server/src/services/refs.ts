import type { ServerContext } from '../context.js';

export type RefKind = 'state' | 'edge' | 'form';

/** Resolve `about_ref` to a state (seen in this run), edge or form of this run, with its evidence_ref. */
export async function resolveRef(
  ctx: ServerContext,
  runId: string,
  ref: string,
): Promise<{ kind: RefKind; evidence_ref: string } | null> {
  const state = await ctx.db
    .selectFrom('state_observations')
    .innerJoin('states', 'states.id', 'state_observations.state_id')
    .select('states.evidence_ref')
    .where('state_observations.run_id', '=', runId)
    .where('states.id', '=', ref)
    .executeTakeFirst();
  if (state) return { kind: 'state', evidence_ref: state.evidence_ref };

  const edge = await ctx.db
    .selectFrom('edges')
    .select('evidence_ref')
    .where('run_id', '=', runId)
    .where('id', '=', ref)
    .executeTakeFirst();
  if (edge) return { kind: 'edge', evidence_ref: edge.evidence_ref };

  const form = await ctx.db
    .selectFrom('forms')
    .select('evidence_ref')
    .where('run_id', '=', runId)
    .where('id', '=', ref)
    .executeTakeFirst();
  if (form) return { kind: 'form', evidence_ref: form.evidence_ref };
  return null;
}
