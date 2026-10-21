import { decide, type GateContext } from '@pathfinder/crawler';
import type { ServerContext } from '../../context.js';
import { recordTransition, type RunRow } from '../../services/index.js';
import { ensureJourney } from './journey.js';
import { transitionKind } from './record-page.js';
import type { RunState } from '../run-state.js';
import { descriptorOf, getAction, withoutPageUrl, type ActionRow } from './actions.js';
import { orFail, ReportedFailure, reported, type Reported } from './context.js';
import { actionTarget, gateContext, gateEvent, refuse, usage } from './gate.js';
import { traceBoundary } from './trace-boundary.js';

type Gated = { action: ActionRow; g: GateContext; d: ReturnType<typeof decide> };

/** Load the issued action and re-check it; refuses (and records a skipped transition) when not allowed. */
export async function gateAct(
  ctx: ServerContext,
  run: RunRow,
  state: RunState,
  actionId: string,
): Promise<Reported<Gated>> {
  const action = await getAction(ctx, run.id, actionId);
  const descriptor = descriptorOf(action);

  // The server re-derives the class and re-checks everything; nothing the agent says is trusted.
  const priorActions = await ctx.db
    .selectFrom('transitions')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('run_id', '=', run.id)
    .where('from_state', '=', action.state_id)
    .executeTakeFirstOrThrow();
  // Depth counts from the action's own state: the browser may be elsewhere (reach_state goes back).
  const fromDepth = state.depthByState.get(action.state_id) ?? 0;
  const g = gateContext(state, await usage(ctx, run, state, Number(priorActions.n), fromDepth + 1));
  const d = decide({ kind: 'act', descriptor, currentUrl: action.json.page_url }, g);
  const reports = [gateEvent(state, { kind: 'act', action }, d)];
  if (d.allowed) return reported({ action, g, d }, reports);

  await orFail(
    reports,
    recordSkippedTransition(ctx, run, state, action, d.classification.safetyClass),
  );
  const refused = refuse(ctx, run, d, actionTarget(action, d.classification.safetyClass), reports);
  // A trace stops where the safety class does (a set ceiling below the action, spec 021):
  // robots, denylist and scope refusals stay plain ACTION_REFUSED.
  if (state.isTrace && d.status === 'skipped_unsafe') {
    const withRefusal = await refused.catch((e: unknown) =>
      e instanceof ReportedFailure ? e.reports : reports,
    );
    return orFail(withRefusal, traceBoundary(ctx, run, state, action, d));
  }
  return refused;
}

/** The refused action as a `skipped` transition from its state, on that state's evidence. */
async function recordSkippedTransition(
  ctx: ServerContext,
  run: RunRow,
  state: RunState,
  action: ActionRow,
  safetyClass: ReturnType<typeof decide>['classification']['safetyClass'],
): Promise<void> {
  const stateEvidence = await ctx.db
    .selectFrom('states')
    .select('evidence_ref')
    .where('id', '=', action.state_id)
    .executeTakeFirstOrThrow();
  // A refused action is a step of the journey that led nowhere (spec 039 design § 5.6: `blocked`).
  const journeyId = await ensureJourney(ctx, state);
  await recordTransition(ctx, {
    journey_id: journeyId,
    seq: ++state.journey!.seq,
    from_observation_id: state.lastObservationId,
    element_key:
      action.json.element_key ??
      `${action.role}|${action.accessible_name ?? ''}||${action.json.nth}`,
    kind: transitionKind(action),
    result: 'blocked',
    driver: state.headless ? 'headless' : 'agent',
    run_id: run.id,
    from_state: action.state_id,
    to_state: null,
    action: {
      role: action.role,
      accessible_name: action.accessible_name,
      ...withoutPageUrl(action.json),
    },
    safety_class: safetyClass,
    status: 'skipped',
    evidence_ref: stateEvidence.evidence_ref,
    confidence: 'observed',
  });
}
