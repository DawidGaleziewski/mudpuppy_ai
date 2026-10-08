import { observePage } from '@pathfinder/crawler';
import type { PageResult } from '../../runtime.js';
import { handoffIfCaptcha } from '../handoff.js';
import { reported, step, type StepContext } from './context.js';
import type { IssuedAction } from './enqueue.js';
import { issueAndEnqueue } from './enqueue.js';
import { fingerprintStep, type Observed } from './fingerprint-step.js';
import { recordNetwork } from './network.js';
import { recordFormsStep, recordTraceStep, recordTransitionStep } from './record-page.js';
import { recordStateStep, trackDepth } from './record-state.js';
import { settleStep } from './settle.js';
import { persistStop, throwIfStopped } from './stop.js';
import { newStateVisuals } from './visuals.js';

/**
 * Observe the current page, fingerprint it and record everything (states, forms, API calls,
 * actions, frontier), as named steps in a fixed order (G-18). The golden test
 * (`tests/pipeline-golden.e2e.test.ts`) locks that order.
 */
export async function processPage(sc: StepContext): Promise<PageResult> {
  const { ctx, run, rs } = sc;
  const { stabilization, relogged } = await settleStep(sc);
  const observed = await step(sc, 'observe', async () =>
    reported(await observePage(rs.session.page)),
  );
  const net = await step(sc, 'net_drain', async () => {
    const drained = await rs.session.recorder.drain();
    await throwIfStopped(ctx, rs);
    return reported(drained);
  });
  const fingerprinted = await fingerprintStep(sc, observed);
  const { masked, routeTemplate, assignment } = fingerprinted;
  const storedSnapshot = rs.effective.portal.pii_scrub ? masked : observed.ariaSnapshot;
  const recorded = await recordStateStep(sc, {
    observed,
    fingerprinted,
    storedSnapshot,
    stabilization,
  });
  const { evidenceRef, state_id, created, stateRow } = recorded;
  const alreadyInRun = recorded.alreadyInRun !== undefined;
  if (created)
    await newStateVisuals(sc, { id: state_id, title: stateRow.title, snapshot: storedSnapshot });
  // A CAPTCHA on the page: a human's job, never ours (spec 009 FR-022).
  await handoffIfCaptcha(ctx, rs, state_id, routeTemplate, (w) => persistStop(ctx, rs, w));
  await trackDepth(sc, state_id, observed.url);
  const page = { observed, stateId: state_id, evidenceRef, alreadyInRun };
  const formCount = await recordFormsStep(sc, page);
  // Edge (for act) first: API calls observed during an action hang off it.
  const edgeId = await recordTransitionStep(sc, { stateId: state_id, evidenceRef, stabilization });
  await step(sc, 'record_api_calls', () => recordNetwork(ctx, run, net, edgeId, state_id));
  const issued = await step(sc, 'enqueue_frontier', () =>
    issueAndEnqueue(ctx, run, rs, observed, {
      state_id,
      created,
      evidenceRef,
      alreadyInRun,
      routeTemplate,
      clusterId: assignment.clusterId,
      depth: sc.depth,
    }),
  );
  const recordedStep = await recordTraceStep(sc, {
    observed,
    masked,
    stateId: state_id,
    evidenceRef,
    edgeId,
  });
  rs.lastObserved = { url: observed.url, title: observed.title, snapshot: masked };
  rs.currentStateId = state_id;
  rs.currentUrl = observed.url;
  return {
    state_id,
    created,
    cluster_id: stateRow.cluster_id,
    title: stateRow.title,
    route_template: stateRow.route_template,
    forms: formCount,
    actions: issuedForAgent(sc, issued),
    ...(edgeId ? { edge_id: edgeId } : {}),
    ...(recordedStep ? { step: recordedStep } : {}),
    ...(relogged ? { relogged_in: true } : {}),
  };
}

/** The page's actions as the agent sees them, with the persona's trace value where one fits. */
function issuedForAgent(sc: StepContext, issued: IssuedAction[]): PageResult['actions'] {
  const inputs = sc.rs.effective.persona.trace_inputs ?? {};
  return issued.map((a) => ({
    action_id: a.actionId,
    role: a.role,
    accessible_name: a.name,
    safety_class: a.safetyClass,
    allowed: a.allowed,
    ...(a.skip_reason ? { skip_reason: a.skip_reason } : {}),
    ...(a.input && a.input !== 'check' && a.name !== null && inputs[a.name] !== undefined
      ? { suggested_value: inputs[a.name] }
      : {}),
  }));
}

export type { Observed };
