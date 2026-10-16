import { shapeUrl } from '@pathfinder/trace';
import {
  followClientRedirects,
  waitForMountsIn,
  walkFrames,
  type ClientRedirects,
  type MountProbe,
  type MountWait,
  type PageMountWait,
  type SettleOutcome,
} from '@pathfinder/crawler';
import { pageTimeouts } from '@pathfinder/safety';
import { navigationPolicy } from './gate.js';
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
import { retryTransientErrors } from './transient.js';
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

/**
 * `event mfe_mount_timeout` per mount point still empty when the wait ran out (spec 015 R4), in the
 * top document (`frame: ''`) and in each frame read with it (`frame`: its URL, spec 019 LO-53).
 */
export function mountReports(w: MountWait & { frames?: PageMountWait['frames'] }): Report[] {
  const empty = (frame: string, probe: MountProbe) =>
    probe.mounts
      .filter((m) => !m.filled)
      .map((m) =>
        event('mfe_mount_timeout', {
          selector: m.selector,
          frame,
          waited_ms: Math.round(w.waitedMs),
          bundles: probe.bundles.length,
        }),
      );
  return [
    ...(w.timedOut ? empty('', w) : []),
    ...(w.frames ?? []).filter((f) => f.timedOut).flatMap((f) => empty(f.url, f.probe)),
  ];
}

/**
 * `event client_redirect` when the page redirected itself (spec 019 FR-007): how many hops were
 * waited through, a refresh too slow to wait for, or a loop stopped at the hop cap.
 */
export function clientRedirectReports(r: ClientRedirects): Report[] {
  if (r.followed === 0 && r.pending === null && !r.capped) return [];
  return [
    event('client_redirect', {
      followed: r.followed,
      capped: r.capped,
      ...(r.pending
        ? { pending_refresh: { delay_ms: Math.round(r.pending.delayMs), target: r.pending.target } }
        : {}),
    }),
  ];
}

/**
 * Wait for the page to settle; obstacles dismissed meanwhile are traced, a block stops the run. A
 * page that redirects itself (meta refresh, script) is waited through first, so an interstitial is
 * never observed as a screen (LO-23). A page that loads micro-frontends at run time is then given
 * until its mount points fill (bounded by `scope.mfe_wait_ms`) and settled once more, so the
 * observation sees the rendered front end.
 */
function settle(sc: StepContext) {
  const { ctx, rs } = sc;
  return step(sc, 'settle', async () => {
    // Per-page timeouts only when the portal sets `timeouts` (spec 023 US4); else as before.
    const portalTimeouts = rs.effective.portal.timeouts;
    const t = portalTimeouts ? pageTimeouts(portalTimeouts, rs.scope, rs.session.page.url()) : null;
    const settleMs = t?.settle_ms;
    let outcome = await rs.session.settleTraced(settleMs);
    const redirects = await followClientRedirects(rs.session.page, {
      maxWaitMs: t?.client_redirect_wait_ms ?? rs.scope.client_redirect_wait_ms,
      navigating: () => rs.session.navigation.navigating(),
    });
    if (redirects.followed > 0) outcome = await rs.session.settleTraced(settleMs);
    const transient = await retryTransientErrors(rs, () => rs.session.settleTraced(settleMs));
    if (transient.outcome) outcome = transient.outcome;
    const mounts = await waitForMountsIn(
      rs.session.page,
      () => framesRead(rs),
      t?.mfe_wait_ms ?? rs.scope.mfe_wait_ms,
    );
    if (mounts.waitedMs >= MOUNT_RESETTLE_MS) outcome = await rs.session.settleTraced(settleMs);
    rs.lastMounts = mounts;
    const reports = [
      ...(t ? [event('page_timeouts', { ...t, url: rs.session.page.url() })] : []),
      ...settleReports(rs, outcome),
      ...clientRedirectReports(redirects),
      ...transient.reports,
      ...mountReports(mounts),
      ...obstacleReports(rs),
    ];
    await orFail(reports, throwIfStopped(ctx, rs));
    return reported(outcome.result, reports);
  });
}

/** The frames the observation will read (same walk and filter as `observe`), whose mounts count too. */
async function framesRead(rs: RunState) {
  const inScope = navigationPolicy(rs);
  const walk = await walkFrames(rs.session.page, {
    maxDepth: rs.scope.frame_depth,
    inScope: (url) => inScope(url) === null,
  });
  return walk.frames.filter((f) => f.observed).map((f) => f.frame);
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
