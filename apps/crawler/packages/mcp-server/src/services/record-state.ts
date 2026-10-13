import { Confidence, PageComposition, Stabilization, newId, nowIso } from '@pathfinder/core';
import type { PathfinderDb } from '@pathfinder/store';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { parseInput } from '../errors.js';
import { getRun, requireEvidenceAndConfidence } from './common.js';

/** Strict: a client-supplied `id` (or any unknown key) is rejected; ids are server-generated. */
export const RecordStateInput = z
  .object({
    run_id: z.string().min(1),
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 hex'),
    cluster_id: z.string().min(1),
    route_template: z.string().min(1),
    title: z.string(),
    evidence_ref: z.string().min(1),
    confidence: Confidence,
    stabilization: Stabilization.default('settled'),
    /** What the page is made of (spec 015); stored with this run's sighting of the state. */
    composition: PageComposition.optional(),
  })
  .strict();
export type RecordStateInput = z.input<typeof RecordStateInput>;

/**
 * Attach the screenshot and layout captured when the state was first recorded (spec 008 FR-008).
 * Write-once: a state that already has a screenshot keeps it.
 */
export async function setStateVisuals(
  ctx: ServerContext,
  stateId: string,
  refs: { screenshot_ref: string; layout_ref: string },
): Promise<boolean> {
  const r = await ctx.db
    .updateTable('states')
    .set(refs)
    .where('id', '=', stateId)
    .where('screenshot_ref', 'is', null)
    .executeTakeFirst();
  return Number(r.numUpdatedRows) === 1;
}

/**
 * The screen a new state is a revision of (spec 022 R1: `(portal, route template, cluster)`),
 * created on its first state, and the state's revision number (r1, r2, … by first sighting).
 * The screen's title follows its newest revision.
 */
async function screenFor(
  trx: PathfinderDb, // a transaction is a Kysely instance too
  run: { id: string; portal_id: string },
  input: { route_template: string; cluster_id: string; title: string },
  ts: string,
): Promise<{ id: string; nextRev: number }> {
  const found = await trx
    .selectFrom('screens')
    .select('id')
    .where('portal_id', '=', run.portal_id)
    .where('route_template', '=', input.route_template)
    .where('cluster_id', '=', input.cluster_id)
    .executeTakeFirst();
  if (found === undefined) {
    const id = newId();
    await trx
      .insertInto('screens')
      .values({
        id,
        portal_id: run.portal_id,
        route_template: input.route_template,
        cluster_id: input.cluster_id,
        title: input.title,
        first_seen_run: run.id,
        created_at: ts,
      })
      .execute();
    return { id, nextRev: 1 };
  }
  const last = await trx
    .selectFrom('states')
    .select((eb) => eb.fn.max('screen_rev').as('rev'))
    .where('screen_id', '=', found.id)
    .executeTakeFirst();
  await trx.updateTable('screens').set({ title: input.title }).where('id', '=', found.id).execute();
  return { id: found.id, nextRev: Number(last?.rev ?? 0) + 1 };
}

/** Idempotent by fingerprint: an existing state is reused (`created: false`) and the run's sighting recorded. */
export async function recordState(
  ctx: ServerContext,
  raw: unknown,
): Promise<{ state_id: string; created: boolean }> {
  requireEvidenceAndConfidence(raw);
  const input = parseInput(RecordStateInput, raw);
  const run = await getRun(ctx, input.run_id);
  const ts = nowIso();

  return ctx.db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('states')
      .select('id')
      // State identity is per portal: an identical page on another portal is another state (FR-027).
      .where('portal_id', '=', run.portal_id)
      .where('fingerprint', '=', input.fingerprint)
      .executeTakeFirst();
    let stateId: string;
    let created: boolean;
    if (existing) {
      stateId = existing.id;
      created = false;
    } else {
      stateId = newId();
      created = true;
      const screen = await screenFor(trx, run, input, ts);
      await trx
        .insertInto('states')
        .values({
          id: stateId,
          portal_id: run.portal_id,
          fingerprint: input.fingerprint,
          cluster_id: input.cluster_id,
          route_template: input.route_template,
          title: input.title,
          evidence_ref: input.evidence_ref,
          confidence: input.confidence,
          stabilization: input.stabilization,
          first_seen_run: run.id,
          created_at: ts,
          screen_id: screen.id,
          screen_rev: screen.nextRev,
        })
        .execute();
    }
    await trx
      .insertInto('state_observations')
      .values({
        run_id: run.id,
        state_id: stateId,
        persona_id: run.persona_id,
        evidence_ref: input.evidence_ref,
        observed_at: ts,
        composition_json: input.composition ? JSON.stringify(input.composition) : null,
      })
      .onConflict((oc) => oc.columns(['run_id', 'state_id']).doNothing())
      .execute();
    return { state_id: stateId, created };
  });
}
