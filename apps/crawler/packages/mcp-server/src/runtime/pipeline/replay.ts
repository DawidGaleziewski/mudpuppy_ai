import { maskText } from '@pathfinder/core';
import { captureAria, decide } from '@pathfinder/crawler';
import { canonicalizeAria, formControls } from '@pathfinder/fingerprint';
import type { ServerContext } from '../../context.js';
import { ToolError } from '../../errors.js';
import type { RunRow } from '../../services/index.js';
import type { RunState } from '../run-state.js';
import { descriptorOf, getAction, type ActionRow } from './actions.js';
import { autofillBeforeSubmit } from './autofill.js';
import { event, fail, reported, step, type Report } from './context.js';
import { findAgain, type Locator } from './find-again.js';
import { gateContext, gateEvent, usage } from './gate.js';
import { settleReports } from './settle.js';
import { throwIfStopped } from './stop.js';

/** What a replay needs: the server, the run and its browser state. */
export interface ReplayScope {
  ctx: ServerContext;
  run: RunRow;
  rs: RunState;
}

/**
 * True when reaching `stateId` by its URL alone would land elsewhere: the state was reached by
 * acting on a page of the same route (a same-URL form step, spec 032 F-01).
 */
export function needsReplay(rs: RunState, stateId: string, pageUrl: string): boolean {
  const path = rs.pathTo.get(stateId);
  return (
    path !== undefined &&
    path.steps.length > 0 &&
    rs.stepOfState.has(stateId) &&
    rs.routeTemplateFor(path.url) === rs.routeTemplateFor(pageUrl)
  );
}

/** Click, fill, select or check, like `act` does (map mode fills a form before its submit). */
async function perform(sc: ReplayScope, action: ActionRow, locator: Locator, value: string | null) {
  const kind = action.json.input;
  if (kind === 'fill') return locator.fill(value ?? '', { timeout: 5000 });
  if (kind === 'select') return void (await locator.selectOption(value, { timeout: 5000 }));
  if (kind === 'check') return locator.check({ timeout: 5000 });
  if (!sc.rs.isTrace) await autofillBeforeSubmit(sc.rs, action, locator);
  return locator.click({ timeout: 30_000 });
}

/** The form step the browser shows now, or null when it shows no known step. */
async function stepShown(rs: RunState): Promise<string | null> {
  const snapshot = maskText(await captureAria(rs.session.page));
  const fc = formControls(canonicalizeAria(snapshot).nodes);
  return rs.formSteps?.match(rs.routeTemplateFor(rs.session.page.url()), fc).step?.id ?? null;
}

function diverged(target: string, atStep: number, expected: string | null, seen: string | null) {
  return new ToolError(
    'REPLAY_DIVERGED',
    `the way back to state ${target} diverged at step ${atStep}: expected form step ${expected ?? '-'}, saw ${seen ?? 'no known step'}`,
    { target_state: target, at_step: atStep, expected_step: expected, seen_step: seen },
  );
}

/**
 * Go back to a state along the path the run took to it (spec 032 plan decision 4): open the URL of
 * the last navigate, redo the acted steps through the same gates, and check the browser shows the
 * state's form step again. A mismatch stops with `REPLAY_DIVERGED` (design §4: replay is checked).
 */
export function returnToState(sc: ReplayScope, target: string): Promise<void> {
  const { ctx, run, rs } = sc;
  const path = rs.pathTo.get(target);
  if (path === undefined)
    throw new ToolError(
      'NO_PATH',
      `state ${target} was not reached by navigate or act in this run`,
    );
  return step(sc, 'replay', async () => {
    const reports: Report[] = [];
    const g = gateContext(rs, await usage(ctx, run, rs, 0));
    const nav = decide({ kind: 'navigate', url: path.url }, g);
    reports.push(gateEvent(rs, { kind: 'navigate', url: path.url }, nav));
    if (!nav.allowed) fail(reports, new ToolError('ACTION_REFUSED', nav.reason));
    await rs.session.goto(path.url);
    reports.push(...settleReports(rs, await rs.session.settleTraced()));
    for (const [i, s] of path.steps.entries()) {
      const action = await getAction(ctx, run.id, s.actionId);
      const d = decide(
        { kind: 'act', descriptor: descriptorOf(action), currentUrl: rs.session.page.url() },
        g,
      );
      reports.push(gateEvent(rs, { kind: 'act', action }, d));
      if (!d.allowed) fail(reports, new ToolError('ACTION_REFUSED', d.reason));
      const found = await findAgain(rs.session.page, action);
      if (found.locator === null) fail(reports, diverged(target, i + 1, null, null));
      await perform(sc, action, found.locator, s.value).catch((e: unknown) =>
        fail(reports, diverged(target, i + 1, null, maskText(String(e).split('\n')[0] ?? ''))),
      );
      await throwIfStopped(ctx, rs);
      reports.push(...settleReports(rs, await rs.session.settleTraced()));
    }
    await rs.session.recorder.drain();
    const expected = rs.stepOfState.get(target) ?? null;
    const seen = expected === null ? null : await stepShown(rs);
    if (expected !== null && seen !== expected) {
      reports.push(
        event('replay_diverged', {
          target_state: target,
          at_step: path.steps.length,
          expected_step: expected,
          seen_step: seen,
        }),
      );
      fail(reports, diverged(target, path.steps.length, expected, seen));
    }
    rs.currentStateId = target;
    rs.currentUrl = rs.session.page.url();
    return reported(undefined, reports);
  });
}
