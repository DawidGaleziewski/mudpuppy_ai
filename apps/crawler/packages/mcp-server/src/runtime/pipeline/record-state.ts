import { StateComponents, maskText, nowIso } from '@pathfinder/core';
import type { SettleOutcome } from '@pathfinder/crawler';
import { computeComponents, minhashBlob, type FingerprintProfile } from '@pathfinder/fingerprint';
import type { PageCapture } from './capture-v2.js';
import type { ServerContext } from '../../context.js';
import { recordState } from '../../services/index.js';
import type { RunState } from '../run-state.js';
import { pageComposition } from './composition.js';
import { event, reported, step, type StepContext } from './context.js';
import type { Fingerprinted, Observed } from './fingerprint-step.js';
import { assignFormStep, formStepReports } from './form-step.js';

/** Store the snapshot as evidence and record (or find) the state of this fingerprint. */
export function recordStateStep(
  sc: StepContext,
  args: {
    observed: Observed;
    fingerprinted: Fingerprinted;
    storedSnapshot: string;
    stabilization: SettleOutcome['result'];
    capture: PageCapture;
  },
) {
  const { ctx, run, rs } = sc;
  const { observed, storedSnapshot, stabilization } = args;
  const { routeTemplate, fp, assignment } = args.fingerprinted;
  const scrub = rs.effective.portal.pii_scrub;
  return step(sc, 'record_state', async () => {
    const evidenceRef = await ctx.evidence.storeText(storedSnapshot, 'yaml');
    const formStep = await assignFormStep(ctx, sc, {
      routeTemplate,
      snapshot: args.fingerprinted.masked,
    });
    const alreadyInRun = await ctx.db
      .selectFrom('state_observations')
      .innerJoin('states', 'states.id', 'state_observations.state_id')
      .select('states.id')
      .where('state_observations.run_id', '=', run.id)
      .where('states.fingerprint', '=', fp.level1)
      .executeTakeFirst();
    const { state_id, created } = await recordState(ctx, {
      run_id: run.id,
      fingerprint: fp.level1,
      cluster_id: assignment.clusterId,
      route_template: routeTemplate,
      title: scrub ? maskText(observed.title) : observed.title,
      evidence_ref: evidenceRef,
      confidence: 'observed',
      stabilization,
      composition: pageComposition(observed, sc.rs.lastMounts),
      form_step_id: formStep.stepId,
      // Chromium's error page is never a page of the portal's own (spec 036 FR-002).
      state_kind: args.fingerprinted.browserError ? 'technical' : formStep.kind,
    });
    if (formStep.stepId !== null) rs.stepOfState.set(state_id, formStep.stepId);
    await recordComponents(ctx, state_id, {
      routeTemplate,
      masked: args.fingerprinted.masked,
      capture: args.capture,
      profile: rs.profile,
    });
    const stateRow = await ctx.db
      .selectFrom('states')
      .select(['cluster_id', 'title', 'route_template'])
      .where('id', '=', state_id)
      .executeTakeFirstOrThrow();
    return reported({ evidenceRef, alreadyInRun, state_id, created, stateRow, formStep }, [
      event('state_recorded', { state_id, created, evidence_ref: evidenceRef }),
      ...formStepReports(state_id, formStep),
    ]);
  });
}

/**
 * The state's fingerprint v2 components (spec 039 design § 5.4), written once: the first sighting
 * of a state decides them, a later one finds the row there.
 */
async function recordComponents(
  ctx: ServerContext,
  stateId: string,
  page: {
    routeTemplate: string;
    masked: string;
    capture: PageCapture;
    profile: FingerprintProfile;
  },
): Promise<void> {
  const c = computeComponents(
    {
      routeTemplate: page.routeTemplate,
      ariaSnapshot: page.masked,
      calls: page.capture.calls,
      mounts: page.capture.mounts,
    },
    page.profile,
  );
  const row = StateComponents.parse({
    state_id: stateId,
    structure_hash: c.structureHash,
    content_hash: c.contentHash,
    overlay_hash: c.overlayHash,
    calls_hash: c.callsHash,
    mounts_hash: c.mountsHash,
    minhash: c.minhash,
    element_keys: c.elementKeys,
    profile: page.profile.id,
  });
  await ctx.db
    .insertInto('state_components')
    .values({
      ...row,
      minhash: minhashBlob(row.minhash),
      element_keys: JSON.stringify(row.element_keys),
    })
    .onConflict((oc) => oc.column('state_id').doNothing())
    .execute();
}

/**
 * Remember the shallowest depth a state and a URL were reached at. A shorter path to a state already
 * queued brings its depth-skipped items within budget again.
 */
export async function trackDepth(sc: StepContext, stateId: string, url: string): Promise<void> {
  const { ctx, run, rs, depth } = sc;
  const knownDepth = rs.depthByState.get(stateId);
  if (knownDepth === undefined || knownDepth > depth) rs.depthByState.set(stateId, depth);
  if (knownDepth !== undefined && knownDepth > depth && !rs.isTrace)
    await reopenDepthSkipped(ctx, rs, run.id, stateId, depth);
  const urlDepth = rs.depthByUrl.get(url);
  if (urlDepth === undefined || urlDepth > depth) rs.depthByUrl.set(url, depth);
}

/**
 * A state's items skipped only for `budget:max_depth` go back to `pending` at the state's new,
 * shallower depth when that brings them within the budget; `act` gates each one again.
 */
async function reopenDepthSkipped(
  ctx: ServerContext,
  rs: RunState,
  runId: string,
  stateId: string,
  depth: number,
): Promise<void> {
  if (depth + 1 > rs.scope.max_depth) return;
  await ctx.db
    .updateTable('frontier')
    .set({ status: 'pending', reason: null, depth, updated_at: nowIso() })
    .where('run_id', '=', runId)
    .where('state_id', '=', stateId)
    .where('status', '=', 'budget_reached')
    .where('reason', 'like', 'budget:max_depth:%')
    .execute();
}
