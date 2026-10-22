import { observePage } from '@mudpuppy/crawler';
import type { PageResult } from '../../runtime.js';
import { linkPath } from '../../services/link-path.js';
import { handoffIfCaptcha } from '../handoff.js';
import { notePatched, runPageLoadHooks } from '../hooks.js';
import { noteFailedAssets } from '../render-health.js';
import { reported, step, type StepContext } from './context.js';
import type { IssuedAction } from './enqueue.js';
import { issueAndEnqueue } from './enqueue.js';
import { modelCaptureStep } from './capture-step.js';
import { fingerprintStep, type Observed } from './fingerprint-step.js';
import { compositionHints } from './composition.js';
import { frameReports } from './frames.js';
import { navigationPolicy } from './gate.js';
import { recordNetwork } from './network.js';
import { recordFormsStep, recordTraceStep, recordTransitionStep } from './record-page.js';
import { recordStateStep, trackDepth } from './record-state.js';
import { settleStep } from './settle.js';
import { throwIfStopped } from './stop.js';
import { recordObservationStep } from './observations.js';
import { newStateVisuals } from './visuals.js';

/**
 * Observe the current page, fingerprint it and record everything (states, forms, API calls,
 * actions, frontier), as named steps in a fixed order (G-18). The golden test
 * (`tests/pipeline-golden.e2e.test.ts`) locks that order.
 */
export async function processPage(sc: StepContext): Promise<PageResult> {
  const { ctx, run, rs } = sc;
  const pageHooks = await runPageLoadHooks(rs);
  const { stabilization, relogged } = await settleStep(sc);
  const observed = await step(sc, 'observe', async () => {
    const inScope = navigationPolicy(rs);
    const o = await observePage(rs.session.page, {
      frameDepth: rs.scope.frame_depth,
      frameInScope: (url) => inScope(url) === null,
    });
    return reported(o, frameReports(o));
  });
  const net = await step(sc, 'net_drain', async () => {
    const drained = await rs.session.recorder.drain();
    await throwIfStopped(ctx, rs);
    return reported(drained);
  });
  const fingerprinted = await fingerprintStep(sc, observed);
  const { masked, routeTemplate, assignment } = fingerprinted;
  const storedSnapshot = rs.effective.portal.pii_scrub ? masked : observed.ariaSnapshot;
  const capture = await modelCaptureStep(sc, { url: observed.url, masked, net, stabilization });
  const recorded = await recordStateStep(sc, {
    observed,
    fingerprinted,
    storedSnapshot,
    stabilization,
    capture,
  });
  const { evidenceRef, state_id, created, stateRow } = recorded;
  const alreadyInRun = recorded.alreadyInRun !== undefined;
  await notePatched(ctx, rs, state_id, pageHooks);
  await noteFailedAssets(ctx, rs, state_id);
  if (created)
    await newStateVisuals(sc, { id: state_id, title: stateRow.title, snapshot: storedSnapshot });
  // A CAPTCHA on the page: a human's job, never ours (spec 009 FR-022).
  await handoffIfCaptcha(ctx, rs, state_id, routeTemplate);
  await trackDepth(sc, state_id, observed.url);
  const page = { observed, stateId: state_id, evidenceRef, alreadyInRun };
  const formCount = await recordFormsStep(sc, page);
  // Transition (for act) first: API calls observed during an action hang off it.
  const transitionId = await recordTransitionStep(sc, {
    stateId: state_id,
    evidenceRef,
    stabilization,
    result: capture.result,
  });
  await step(sc, 'record_api_calls', () =>
    recordNetwork(ctx, run, net, {
      transitionId,
      stateId: state_id,
      scrub: rs.effective.portal.pii_scrub,
    }),
  );
  await recordObservationStep(sc, {
    stateId: state_id,
    url: observed.url,
    transitionId,
    relogged,
    capture,
    snapshot: storedSnapshot,
  });
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
    transitionId,
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
    // A map run queued a known state's actions on its first visit: listing them again only
    // grows the agent's context (spec 013 US1). A trace acts on the page in front of it.
    ...(rs.isTrace || !alreadyInRun || sc.includeActions
      ? { actions: issuedForAgent(sc, issued) }
      : { actions_omitted: issued.length }),
    ...(transitionId ? { transition_id: transitionId } : {}),
    ...(recordedStep ? { step: recordedStep } : {}),
    ...(relogged ? { relogged_in: true } : {}),
    ...compositionHints(observed, rs.lastMounts),
  };
}

/** The page's actions as the agent sees them, with the persona's trace value where one fits. */
function issuedForAgent(sc: StepContext, issued: IssuedAction[]): PageResult['actions'] {
  const inputs = sc.rs.effective.persona.test_data;
  return issued.map((a) => {
    // An unnamed field is known by its visible label: test data is looked up by it too.
    const known = a.name ?? a.label ?? null;
    const linkTo = a.name === null && a.role === 'link' && a.href ? linkPath(a.href) : null;
    return {
      action_id: a.actionId,
      role: a.role,
      accessible_name: a.name,
      safety_class: a.safetyClass,
      allowed: a.allowed,
      ...(a.skip_reason ? { skip_reason: a.skip_reason } : {}),
      ...(a.found_by ? { found_by: a.found_by } : {}),
      ...(a.label ? { label: a.label } : {}),
      ...(linkTo ? { link_to: linkTo } : {}),
      // The headless driver finds a recorded step's action by its model element key (spec 039).
      ...(sc.rs.headless
        ? { element_key: (a.actionJson as { element_key: string }).element_key }
        : {}),
      ...(a.input && a.input !== 'check' && known !== null && inputs[known] !== undefined
        ? { suggested_value: inputs[known] }
        : {}),
    };
  });
}

export type { Observed };
