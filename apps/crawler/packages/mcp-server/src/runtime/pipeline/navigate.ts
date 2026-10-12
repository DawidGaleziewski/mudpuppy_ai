import { decide, pendingNavigateItems, settleFrontierItem } from '@pathfinder/crawler';
import type { ServerContext } from '../../context.js';
import { ToolError } from '../../errors.js';
import type { NavigateInput, PageResult } from '../../runtime.js';
import type { RunRow } from '../../services/index.js';
import type { RunState } from '../run-state.js';
import { counted, flushObstacles, phase, reported, step } from './context.js';
import {
  gateContext,
  gateEvent,
  itemCapChecked,
  refuse,
  requireIntent,
  usage,
  type RefusalTarget,
} from './gate.js';
import { withNext } from './next-item.js';
import { processPage } from './process-page.js';
import { beginStep, bumpRun, throwIfStopped } from './stop.js';

export async function navigate(
  ctx: ServerContext,
  rs: RunState | undefined,
  input: NavigateInput,
): Promise<PageResult> {
  const run = await phase(ctx, 'begin_step', () => beginStep(ctx, rs, input.run_id));
  requireIntent(rs!, input.intent);
  return counted(rs!, () => navigateStep(ctx, run, rs!, input));
}

async function navigateStep(
  ctx: ServerContext,
  run: RunRow,
  state: RunState,
  input: NavigateInput,
): Promise<PageResult> {
  const started = performance.now();
  state.obstacleCursor = state.session.obstacles.events.length;
  const g = await step({ ctx, run }, 'gate', async () => {
    const g = gateContext(state, await usage(ctx, run, state, 0, state.depthByUrl.get(input.url)));
    const d = decide({ kind: 'navigate', url: input.url }, g);
    const reports = [gateEvent(state, { kind: 'navigate', url: input.url }, d)];
    if (!d.allowed) {
      const target = navigateTarget(state, input.url, d.classification.safetyClass);
      return refuse(ctx, run, d, target, reports);
    }
    let routeTemplate: string;
    try {
      routeTemplate = state.routeTemplateFor(input.url);
    } catch {
      routeTemplate = '/';
    }
    const cap = await itemCapChecked(ctx, state, run.id, routeTemplate);
    reports.push(...cap.reports);
    if (cap.value)
      return refuse(ctx, run, cap.value, navigateTarget(state, input.url, 'read'), reports);
    return reported(g, reports);
  });

  await phase(ctx, 'goto', async () => {
    state.session.navigation.begin(input.url);
    await state.session.goto(input.url);
    await throwIfStopped(ctx, state);
    // The page never opened (refused, unknown host, …): nothing is recorded, and the agent and the
    // BA learn that the address is wrong or the site is down (spec 011 F-06).
    const failed = state.session.lastNavigationError;
    if (failed !== null)
      throw new ToolError(
        'NAVIGATION_FAILED',
        `${input.url} could not be opened (${failed}); the address may be wrong or the site down`,
        { url: input.url, error: failed },
      );
  });
  const depth = g.usage.depth;
  const result = await processPage({
    ctx,
    run,
    rs: state,
    via: { kind: 'navigate' },
    depth,
    ...(state.isTrace
      ? { step: { intent: input.intent!, kind: 'navigate', action_id: null, value: null } }
      : {}),
    reloginTarget: input.url,
    ...(input.include_actions ? { includeActions: true } : {}),
  });
  await step({ ctx, run }, 'run_bookkeeping', async () => {
    for (const pending of await pendingNavigateItems(ctx.db, run.id, input.url))
      await settleFrontierItem(ctx.db, pending.id, 'done', null);
    return bumpRun(ctx, run, started, depth);
  });
  await flushObstacles(ctx, state);
  return withNext(ctx, state, run.id, result);
}

/** A refused navigation is recorded on the page the browser is on (none before the first page). */
function navigateTarget(state: RunState, url: string, safetyClass: string): RefusalTarget {
  return {
    subject: url,
    action: { kind: 'navigate', url },
    safetyClass,
    stateId: state.currentStateId,
    actionId: null,
  };
}
