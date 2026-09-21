import { Confidence, Stabilization, newId, nowIso } from '@pathfinder/core';
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
  })
  .strict();
export type RecordStateInput = z.input<typeof RecordStateInput>;

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
      await trx
        .insertInto('states')
        .values({
          id: stateId,
          fingerprint: input.fingerprint,
          cluster_id: input.cluster_id,
          route_template: input.route_template,
          title: input.title,
          evidence_ref: input.evidence_ref,
          confidence: input.confidence,
          stabilization: input.stabilization,
          first_seen_run: run.id,
          created_at: ts,
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
      })
      .onConflict((oc) => oc.columns(['run_id', 'state_id']).doNothing())
      .execute();
    return { state_id: stateId, created };
  });
}
