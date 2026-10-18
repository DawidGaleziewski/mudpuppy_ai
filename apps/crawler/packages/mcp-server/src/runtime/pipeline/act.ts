import { maskText } from '@pathfinder/core';
import {
  decide,
  pendingItemForAction,
  settleFrontierItem,
  type GateContext,
} from '@pathfinder/crawler';
import type { Refusal } from '@pathfinder/safety';
import type { ServerContext } from '../../context.js';
import { ToolError } from '../../errors.js';
import { saveCheckpoint } from '../../services/checkpoints.js';
import type { ActInput, PageResult } from '../../runtime.js';
import type { RunRow } from '../../services/index.js';
import type { RunState } from '../run-state.js';
import { getAction, inputValue, type ActionRow } from './actions.js';
import { gateAct } from './act-gate.js';
import { autofillBeforeSubmit } from './autofill.js';
import { withFault } from './fault.js';
import { findAgain, type Locator } from './find-again.js';
import {
  ANSI_STYLE,
  counted,
  event,
  flushObstacles,
  obstacleReports,
  orFail,
  phase,
  reported,
  step,
} from './context.js';
import { actionTarget, gateEvent, itemCapChecked, refuse, requireIntent } from './gate.js';
import { withNext } from './next-item.js';
import { queueOpenedWindows } from './popups.js';
import { processPage } from './process-page.js';
import { needsReplay, returnToState } from './replay.js';
import { pathByAct } from './run-path.js';
import { settleReports } from './settle.js';
import { beginStep, bumpRun, throwIfStopped } from './stop.js';

export async function act(
  ctx: ServerContext,
  rs: RunState | undefined,
  input: ActInput,
): Promise<PageResult> {
  const run = await phase(ctx, 'begin_step', () => beginStep(ctx, rs, input.run_id));
  requireIntent(rs!, input.intent);
  try {
    return await counted(rs!, () => actStep(ctx, run, rs!, input));
  } catch (e) {
    await retireOnCrash(ctx, run.id, input.action_id, e);
    throw e;
  }
}

/**
 * An `act` that crashed (not a refusal: those settle their item themselves) retires the action's
 * pending frontier item with the error, so the item is never handed out again and `finish_run` can
 * complete with it listed (spec 030 FR-020; in the field such items wedged runs: GC-15, GC-18).
 * Exported for its test (spec 030 F-05: no scar makes `act` crash).
 */
export async function retireOnCrash(
  ctx: ServerContext,
  runId: string,
  actionId: string,
  e: unknown,
): Promise<void> {
  if (e instanceof ToolError && !CRASH_CODES.has(e.code)) return;
  const pending = await pendingItemForAction(ctx.db, runId, actionId).catch(() => undefined);
  if (!pending) return;
  const message = maskText((e as Error)?.message?.split('\n')[0] ?? String(e)).slice(0, 300);
  await settleFrontierItem(ctx.db, pending.id, 'unreachable', `act_failed: ${message}`);
}

/** Tool errors that mean the action could not be done (the agent's own mistakes are not). */
const CRASH_CODES: ReadonlySet<string> = new Set(['NAVIGATION_FAILED', 'SAFETY_CLASS_MISMATCH']);

/** One `act` call after its gate passed: the action, its gate context and the decision. */
interface ActCall {
  ctx: ServerContext;
  run: RunRow;
  state: RunState;
  action: ActionRow;
  g: GateContext;
  d: ReturnType<typeof decide>;
}

/**
 * `onBeforeClickAction` (spec 023 US1.4): a hook may skip the action (its queued item settled with
 * the reason, the agent told) or ask to wait for a selector first (within the hook's timeout).
 */
async function beforeClickAction(call: ActCall, actionId: string): Promise<void> {
  const { ctx, run, state, action } = call;
  if (!state.hooks?.has('onBeforeClickAction')) return;
  const out = await state.hooks.run('onBeforeClickAction', state.session.page.url(), {
    role: action.role,
    name: action.accessible_name ?? '',
    locators: action.json.locators.map(({ kind, value }) => ({ kind, value })),
  });
  if (out.skip !== null) {
    const reason = `skipped by hook ${out.skip.fn}: ${out.skip.reason}`;
    const pending = await pendingItemForAction(ctx.db, run.id, actionId);
    if (pending) await settleFrontierItem(ctx.db, pending.id, 'out_of_scope', reason);
    throw new ToolError('ACTION_REFUSED', `action ${actionId} was not taken: ${reason}`, {
      action_id: actionId,
      rule: `hook:onBeforeClickAction:${out.skip.fn}`,
    });
  }
  if (out.waitFor !== null)
    await state.session.page
      .waitForSelector(out.waitFor, { timeout: 10_000 })
      .catch((err: unknown) =>
        ctx.logger.warn({ err, selector: out.waitFor }, 'hook waitFor did not appear'),
      );
}

async function actStep(
  ctx: ServerContext,
  run: RunRow,
  state: RunState,
  input: ActInput,
): Promise<PageResult> {
  const started = performance.now();
  state.obstacleCursor = state.session.obstacles.events.length;
  if (input.fault && !state.isTrace)
    throw new ToolError('SCHEMA_INVALID', 'fault: trace runs only (map runs use probe_form)');
  if (state.isTrace) await requireCurrentState(ctx, run, state, input.action_id);
  const { action, g, d } = await step({ ctx, run }, 'gate', () =>
    gateAct(ctx, run, state, input.action_id),
  );
  const call: ActCall = { ctx, run, state, action, g, d };
  const value = inputValue(state, action, input.value);
  // Reach the state the action belongs to (through the same gates) when the browser is elsewhere.
  if (state.currentStateId !== action.state_id) await reachState(call);
  if (action.json.href) await checkLinkItemCap(call);
  const { locator, matches } = await locate(call);
  await beforeClickAction(call, input.action_id);
  // Map mode fills a form before pressing its submit control (spec 008 FR-002) on every
  // environment, within the portal's limit when it sets one (spec 021).
  const fills =
    !state.isTrace && !action.json.input
      ? await step(call, 'autofill', () => autofillBeforeSubmit(state, action, locator))
      : [];
  // The hops of this action start on the page it was taken on (spec 019, R-38).
  state.session.navigation.begin(state.session.page.url());
  state.session.takeOpened(); // windows opened before this action are not its pop-ups
  const fromDepth = state.depthByState.get(action.state_id) ?? 0;
  // Typing into a form stays on the same page: only clicks take the trace one level deeper.
  const toDepth = action.json.input ? fromDepth : fromDepth + 1;
  // A trace variant's technical fault breaks this action's request in the browser (spec 032 US3).
  const result = await withFault(state, input.fault, async () => {
    await perform(call, locator, matches, value);
    return processPage({
      ctx,
      run,
      rs: state,
      via: { kind: 'act', action },
      depth: toDepth,
      ...(state.isTrace
        ? {
            step: {
              intent: input.intent!,
              kind: action.json.input ?? 'click',
              action_id: action.id,
              value,
            },
          }
        : {}),
      reloginTarget: action.json.page_url,
      ...(input.include_actions ? { includeActions: true } : {}),
    });
  });
  pathByAct(state, action.state_id, result.state_id, {
    actionId: action.id,
    value,
    ...(fills.length > 0 ? { fills } : {}),
  });
  // After the page settled, so a pop-up's window has opened by now (LO-27).
  await queueOpenedWindows(ctx, run, state, action, fromDepth + 1);
  await step(call, 'run_bookkeeping', async () => {
    const pending = await pendingItemForAction(ctx.db, run.id, action.id);
    if (pending) await settleFrontierItem(ctx.db, pending.id, 'done', null);
    await saveCheckpoint(ctx, run.id, result.state_id, state.pathTo.get(result.state_id));
    return bumpRun(ctx, run, started, toDepth);
  });
  await flushObstacles(ctx, state);
  return withNext(ctx, state, run.id, result);
}

/**
 * A trace acts on the page as it is now. Re-opening an earlier page would silently drop what the
 * previous steps typed, so an action id from another state is refused instead.
 */
async function requireCurrentState(
  ctx: ServerContext,
  run: RunRow,
  state: RunState,
  actionId: string,
): Promise<void> {
  const issued = await getAction(ctx, run.id, actionId);
  if (issued.state_id !== state.currentStateId)
    throw new ToolError(
      'UNKNOWN_ACTION',
      `action_id ${actionId} belongs to an earlier page state; in a trace use the action ids from the latest navigate/act result`,
    );
}

/**
 * Go back to the page the action was found on, through the same gates as `navigate`: a `gate` step
 * (its event lands before the navigation it allows), then the navigation itself.
 */
async function reachState(call: ActCall): Promise<void> {
  const { ctx, state, action } = call;
  const to = action.json.page_url;
  const replay = () => returnToState({ ctx, run: call.run, rs: state }, action.state_id);
  // A step of a same-URL form: its URL shows the first step, so go the run's own way (F-01@032).
  if (needsReplay(state, action.state_id, to) || state.replayOnly.has(action.state_id))
    return replay();
  await gateReach(call, to);
  await step(call, 'reach_state', async () => {
    await state.session.goto(to);
    await throwIfStopped(ctx, state);
    const settled = await state.session.settleTraced();
    await state.session.recorder.drain();
    return reported(undefined, settleReports(state, settled));
  });
  // Loaded by its URL the page can be another screen than the one a click inside the app showed
  // (F-11@031, shop S07): when the element is missing, go the way the run took (spec 037 FR-007).
  if (!canReplay(state, action.state_id)) return;
  if ((await findAgain(state.session.page, action)).locator !== null) return;
  state.replayOnly.add(action.state_id);
  await replay();
}

/** The run reached the state by acting, so it has a path of its own to replay. */
const canReplay = (rs: RunState, stateId: string): boolean =>
  (rs.pathTo.get(stateId)?.steps.length ?? 0) > 0;

function gateReach(call: ActCall, to: string): Promise<void> {
  const { ctx, run, state, action, g } = call;
  return step(call, 'gate', () => {
    const nav = decide({ kind: 'navigate', url: to }, g);
    const reports = [gateEvent(state, { kind: 'navigate', url: to }, nav)];
    if (!nav.allowed)
      return refuse(
        ctx,
        run,
        nav,
        {
          subject: to,
          action: { kind: 'navigate', url: to },
          safetyClass: nav.classification.safetyClass,
          stateId: action.state_id,
          actionId: action.id,
        },
        reports,
      );
    return Promise.resolve(reported(undefined, reports));
  });
}

/** FR-024: a link to another item page is refused once the item view cap is reached. */
function checkLinkItemCap(call: ActCall): Promise<void> {
  const { ctx, run, state, action } = call;
  return step(call, 'gate', async () => {
    let target: string | undefined;
    try {
      target = new URL(action.json.href!, action.json.page_url).toString();
    } catch {
      /* unparseable href: no item-cap check, the gate already vetted the action */
    }
    if (!target) return reported(undefined);
    const cap = await itemCapChecked(ctx, state, run.id, state.routeTemplateFor(target));
    if (cap.value) return refuse(ctx, run, cap.value, actionTarget(action, 'read'), cap.reports);
    return reported(undefined, cap.reports);
  });
}

function locatorAttrs(action: ActionRow) {
  return { role: action.role, accessible_name: action.accessible_name, nth: action.json.nth };
}

/**
 * Find the element again: by role, name and position, or, for a role-less clickable, by its DOM
 * path or exact text (spec 015 R2). Gone, or several where one was recorded, means unreachable;
 * nothing is clicked on a guess (FR-003).
 */
function locate(call: ActCall) {
  const { ctx, run, state, action, d } = call;
  return step(call, 'locate', async () => {
    const found = await findAgain(state.session.page, action);
    if (found.locator === null) {
      const missing = event('locator', {
        ...locatorAttrs(action),
        matches: found.matches,
        outcome: found.outcome,
      });
      const refusal: Refusal = {
        status: 'unreachable',
        rule: 'unreachable',
        reason:
          found.outcome === 'ambiguous'
            ? `${found.matches} elements match ${action.role} ${JSON.stringify(action.accessible_name)} on ${action.json.page_url}; none is clicked on a guess`
            : `${action.role} ${JSON.stringify(action.accessible_name)} is no longer present on ${action.json.page_url}`,
      };
      return refuse(ctx, run, refusal, actionTarget(action, d.classification.safetyClass), [
        missing,
      ]);
    }
    return reported({ locator: found.locator, matches: found.matches });
  });
}

/** Click, fill, select or check the element; a failure is a refusal with Playwright's reason. */
function perform(
  call: ActCall,
  locator: Locator,
  matches: number,
  value: string | null,
): Promise<void> {
  const { ctx, state, action } = call;
  return step(call, 'click', async () => {
    // Reachability first (trial: actionability only, nothing is clicked), then the click itself with
    // the budget of a page load: a click that starts a navigation waits for it, and at a low rate
    // limit that request can queue for a while. A slow navigation must not read as an unreachable
    // element.
    let stage = 'click failed';
    const kind = action.json.input;
    try {
      // A role-less tile in a re-rendering list can take longer to become actionable (spec 030
      // SC-06, field C-4); real controls keep the tight budget so the common case stays fast.
      await locator.click({ trial: true, timeout: action.role === 'generic' ? 15_000 : 5000 });
      stage = 'navigation after click did not start';
      if (kind === 'fill') {
        stage = 'fill failed';
        await locator.fill(value!, { timeout: 5000 });
      } else if (kind === 'select') {
        stage = 'select failed';
        await locator.selectOption(value, { timeout: 5000 });
      } else if (kind === 'check') {
        stage = 'check failed';
        await locator.check({ timeout: 5000 });
      } else await locator.click({ timeout: 30_000 });
    } catch (e) {
      return clickFailed(call, matches, stage, e as Error);
    }
    const reports = [
      event('locator', { ...locatorAttrs(action), matches, outcome: kind ?? 'clicked' }),
    ];
    await orFail(reports, throwIfStopped(ctx, state));
    return reported(undefined, reports);
  });
}

async function clickFailed(
  { ctx, run, state, action, d }: ActCall,
  matches: number,
  stage: string,
  e: Error,
): Promise<never> {
  const reports = [
    event('locator', {
      ...locatorAttrs(action),
      matches,
      outcome: 'click_failed',
      error: maskText(e.message.split('\n')[0] ?? ''),
      // Playwright's call log says why the click never became actionable (an element that
      // "intercepts pointer events", "not visible", "not stable"); the first line never does.
      // The reason is at the end of the log, so the tail is kept.
      call_log: maskText(
        e.message
          .replace(ANSI_STYLE, '')
          .split('\n')
          .slice(1)
          .map((l) => l.trim().slice(0, 200))
          .filter(Boolean)
          .slice(-10)
          .join(' | '),
      ),
    }),
    // A handler may have fired during the failed click; without this the trace would hide it.
    ...obstacleReports(state),
  ];
  await orFail(reports, throwIfStopped(ctx, state));
  const refusal: Refusal = {
    status: 'unreachable',
    rule: 'click_failed',
    reason: `${stage}: ${e.message.split('\n')[0]}`,
  };
  return refuse(ctx, run, refusal, actionTarget(action, d.classification.safetyClass), reports);
}
