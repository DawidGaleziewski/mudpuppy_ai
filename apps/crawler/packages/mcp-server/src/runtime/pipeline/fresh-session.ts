import { ToolError } from '../../errors.js';
import { beginJourney } from './journey.js';
import { loginPreconditions, performLogin } from '../login.js';
import { decision, event, fail, reported, step, type Report } from './context.js';
import type { ReplayScope } from './replay.js';

/** The page's own storage, cleared as a string: a function would need tsx's `__name` shim. */
const CLEAR_STORAGE = 'localStorage.clear(); sessionStorage.clear();';

/**
 * The way back to a probed step, done again once in a new session when it diverged (spec 038
 * F-03, owner 2026-10-18). A wizard that keeps its step on the server (the insurer's claim form) is past
 * the step after the happy press, so the way back in the same session shows the next step. In a new
 * session the server starts the wizard again: the tries then meet the step as before the happy
 * press. A refused try leaves the server on the step, so only a try that moved the wizard on costs
 * the next one a new session. A second divergence stops the step, as before.
 */
export async function againInFreshSession<T>(sc: ReplayScope, back: () => Promise<T>): Promise<T> {
  try {
    return await back();
  } catch (e) {
    if (!(e instanceof ToolError) || e.code !== 'REPLAY_DIVERGED') throw e;
    await freshSession(sc, e.message);
    return back();
  }
}

/** Cookies and the page's storage cleared, and logged in again when the run was. */
function freshSession(sc: ReplayScope, why: string): Promise<void> {
  const { ctx, rs } = sc;
  return step(sc, 'fresh_session', async () => {
    await rs.session.context.clearCookies();
    await rs.session.page.evaluate(CLEAR_STORAGE).catch(() => undefined);
    rs.currentStateId = null;
    await beginJourney(ctx, rs, { kind: 'fresh_session' }, 'reset');
    const relogin = rs.login === 'logged_in';
    const reports: Report[] = [
      decision({
        kind: 'note',
        rule: 'fresh_session',
        reason: `a probe try in a new session: ${why}`,
        detail: { relogin },
      }),
      event('fresh_session', { relogin }),
    ];
    if (!relogin) return reported(undefined, reports);
    const out = await performLogin(ctx, rs, loginPreconditions(rs));
    if (out.outcome === 'logged_in') return reported(undefined, reports);
    if (out.outcome === 'failed') rs.login = 'blocked';
    return fail(
      reports,
      new ToolError(
        'SESSION_LOST',
        `logging in for a new session failed (${out.reason ?? 'unknown'})`,
        {
          reason: out.reason ?? null,
        },
      ),
    );
  });
}
