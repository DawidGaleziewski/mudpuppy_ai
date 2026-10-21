import type { ServerContext } from '../context.js';

export type RefKind = 'state' | 'transition' | 'form';

/** Resolve `about_ref` to a state (seen in this run), transition or form of this run, with its evidence_ref. */
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

  const transition = await ctx.db
    .selectFrom('transitions')
    .select('evidence_ref')
    .where('run_id', '=', runId)
    .where('id', '=', ref)
    .executeTakeFirst();
  if (transition) return { kind: 'transition', evidence_ref: transition.evidence_ref };

  const form = await ctx.db
    .selectFrom('forms')
    .select('evidence_ref')
    .where('run_id', '=', runId)
    .where('id', '=', ref)
    .executeTakeFirst();
  if (form) return { kind: 'form', evidence_ref: form.evidence_ref };
  return null;
}
