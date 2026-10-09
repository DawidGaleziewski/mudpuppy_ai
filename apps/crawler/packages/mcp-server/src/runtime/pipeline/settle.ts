import { shapeUrl } from '@pathfinder/trace';
import { waitForMounts, type MountWait, type SettleOutcome } from '@pathfinder/crawler';
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

/** `event mfe_mount_timeout` per mount point still empty when the wait ran out (spec 015 R4). */
export function mountReports(w: MountWait): Report[] {
  if (!w.timedOut) return [];
  return w.mounts
    .filter((m) => !m.filled)
    .map((m) =>
      event('mfe_mount_timeout', {
        selector: m.selector,
        frame: '',
        waited_ms: Math.round(w.waitedMs),
        bundles: w.bundles.length,
      }),
    );
}

/**
 * Wait for the page to settle; obstacles dismissed meanwhile are traced, a block stops the run. A
 * page that loads micro-frontends at run time is then given until its mount points fill (bounded by
 * `scope.mfe_wait_ms`) and settled once more, so the observation sees the rendered front end.
 */
function settle(sc: StepContext) {
  const { ctx, rs } = sc;
  return step(sc, 'settle', async () => {
    let outcome = await rs.session.settleTraced();
    const mounts = await waitForMounts(rs.session.page, rs.scope.mfe_wait_ms);
    if (mounts.waitedMs >= MOUNT_RESETTLE_MS) outcome = await rs.session.settleTraced();
    rs.lastMounts = mounts;
    const reports = [
      ...settleReports(rs, outcome),
      ...mountReports(mounts),
      ...obstacleReports(rs),
    ];
    await orFail(reports, throwIfStopped(ctx, rs));
    return reported(outcome.result, reports);
  });
}

/** A mount wait shorter than this changed nothing worth a second settle. */
const MOUNT_RESETTLE_MS = 50;

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
