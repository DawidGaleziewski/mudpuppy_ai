import { shapeUrl } from '@pathfinder/trace';
import type { SettleOutcome } from '@pathfinder/crawler';
import { sessionExpired } from '../login.js';
import type { RunState } from '../run-state.js';
import {
  event,
  obstacleReports,
  orFail,
  reported,
  step,
  type Report,
  type StepContext,
} from './context.js';
import { relogin } from './relogin.js';
import { throwIfStopped } from './stop.js';

/** `event stabilization_timeout` when the page never settled (research §9). */
export function settleReports(rs: RunState, outcome: SettleOutcome): Report[] {
  if (!outcome.diagnostics) return [];
  const d = outcome.diagnostics;
  return [
    event('stabilization_timeout', {
      timeout_ms: Math.round(outcome.waitedMs),
      in_flight: d.inFlight.map((r) => ({
        url: shapeUrl(r.url, (u) => rs.peekRouteTemplate(u)),
        resource_type: r.resourceType,
        age_ms: Math.round(r.ageMs),
      })),
      since_mutation_ms: d.sinceMutationMs === null ? null : Math.round(d.sinceMutationMs),
      running_animations: d.runningAnimations,
    }),
  ];
}

/** Wait for the page to settle; obstacles dismissed meanwhile are traced, a block stops the run. */
function settle(sc: StepContext) {
  const { ctx, rs } = sc;
  return step(sc, 'settle', async () => {
    const outcome = await rs.session.settleTraced();
    const reports = [...settleReports(rs, outcome), ...obstacleReports(rs)];
    await orFail(reports, throwIfStopped(ctx, rs));
    return reported(outcome.result, reports);
  });
}

/**
 * Settle the page; when a logged-in run's session expired on the way, log in again, return to the
 * target and settle there (spec 009 FR-020). The expiry page is not observed or recorded: it is not
 * part of the process.
 */
export async function settleStep(
  sc: StepContext,
): Promise<{ stabilization: Awaited<ReturnType<typeof settle>>; relogged: boolean }> {
  const { rs, reloginTarget } = sc;
  const stabilization = await settle(sc);
  const loginSpec = rs.effective.portal.login;
  if (
    reloginTarget !== undefined &&
    loginSpec !== undefined &&
    rs.login === 'logged_in' &&
    !rs.loggingIn &&
    (await sessionExpired(rs.session.page, loginSpec))
  ) {
    await relogin(sc, reloginTarget);
    return { stabilization: await settle(sc), relogged: true };
  }
  return { stabilization, relogged: false };
}
