import { NavigationHop, ObservationVia, StepResult, newId, nowIso } from '@mudpuppy/core';
import type { FingerprintProfile } from '@mudpuppy/fingerprint';
import type { BuildSignature } from '@mudpuppy/model';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { parseInput } from '../errors.js';

export const RecordObservationInput = z
  .object({
    run_id: z.string().min(1),
    state_id: z.string().min(1),
    transition_id: z.string().min(1).nullable(),
    via: ObservationVia,
    url: z.string().min(1),
    hops: z.array(NavigationHop),
    // MudPuppy 2.0 (spec 039 design § 5.6): journey position, result, context and builds.
    journey_id: z.string().min(1),
    seq: z.number().int().positive(),
    result: StepResult,
    context_key: z.string().regex(/^[0-9a-f]{64}$/),
    flags: z.record(z.string(), z.string()),
    build_ids: z.array(z.string().min(1)),
    /** The run's fingerprint profile, `name@hash` (spec 039 T112). */
    fingerprint_profile: z.string().min(1),
  })
  .strict();
export type RecordObservationInput = z.input<typeof RecordObservationInput>;

/**
 * One arrival on a page (spec 019; table `observations`, spec 039): the verbatim URL and the hops
 * that led to it, its journey, order in the run, step result, context and builds. Every arrival is
 * a row, also on a state the run already knows: the second URL a screen is reached under is
 * exactly what R-38 wants recorded.
 */
export async function recordObservation(
  ctx: ServerContext,
  raw: RecordObservationInput,
): Promise<{ observation_id: string }> {
  const input = parseInput(RecordObservationInput, raw);
  const id = newId();
  await ctx.db.transaction().execute(async (tx) => {
    await tx
      .insertInto('observations')
      .values({
        id,
        run_id: input.run_id,
        state_id: input.state_id,
        transition_id: input.transition_id,
        via: input.via,
        url: input.url,
        hops_json: JSON.stringify(input.hops),
        created_at: nowIso(),
        journey_id: input.journey_id,
        seq: input.seq,
        result: input.result,
        context_key: input.context_key,
        flags_json: JSON.stringify(input.flags),
        fingerprint_profile: input.fingerprint_profile,
      })
      .execute();
    if (input.build_ids.length > 0)
      await tx
        .insertInto('observation_builds')
        .values(input.build_ids.map((build_id) => ({ observation_id: id, build_id })))
        .execute();
  });
  return { observation_id: id };
}

/**
 * The portal's fingerprint profile with its resolved rules (spec 039 T112), written the first time
 * a run uses it, so the reconciler reads a profile's threshold from the store.
 */
export async function upsertFingerprintProfile(
  ctx: ServerContext,
  portalId: string,
  profile: FingerprintProfile,
): Promise<void> {
  await ctx.db
    .insertInto('fingerprint_profiles')
    .values({
      portal_id: portalId,
      id: profile.id,
      name: profile.name,
      rules_json: JSON.stringify(profile.rules),
      first_seen: nowIso(),
    })
    .onConflict((oc) => oc.columns(['portal_id', 'id']).doNothing())
    .execute();
}

/**
 * The build rows of a page's scopes (spec 039 design § 5.2): one per (portal, scope, signature),
 * created the first time it is seen. Returns their ids in the order given.
 */
export async function upsertBuilds(
  ctx: ServerContext,
  portalId: string,
  builds: readonly BuildSignature[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const b of builds) {
    await ctx.db
      .insertInto('builds')
      .values({
        id: newId(),
        portal_id: portalId,
        scope: b.scope,
        signature: b.signature,
        source: b.source,
        assets_json: JSON.stringify(b.assets),
        first_seen: nowIso(),
      })
      .onConflict((oc) => oc.columns(['portal_id', 'scope', 'signature']).doNothing())
      .execute();
    const row = await ctx.db
      .selectFrom('builds')
      .select('id')
      .where('portal_id', '=', portalId)
      .where('scope', '=', b.scope)
      .where('signature', '=', b.signature)
      .executeTakeFirstOrThrow();
    ids.push(row.id);
  }
  return ids;
}
