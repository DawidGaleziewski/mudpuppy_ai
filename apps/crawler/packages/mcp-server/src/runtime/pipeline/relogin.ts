import { shapeUrl } from '@mudpuppy/trace';
import { ToolError } from '../../errors.js';
import { loginPreconditions, performLogin } from '../login.js';
import { decision, event, fail, orFail, reported, step, type StepContext } from './context.js';

/**
 * The session expired under a logged-in run: log in once more and go back to where the call was
 * going (spec 009 FR-020); the caller settles there. A failed re-login ends logins for the run.
 */
export function relogin(sc: StepContext, target: string): Promise<void> {
  const { ctx, rs } = sc;
  return step(sc, 'relogin', async () => {
    const from = rs.session.page.url();
    const creds = loginPreconditions(rs);
    const out = await performLogin(ctx, rs, creds);
    if (out.outcome !== 'logged_in') {
      if (out.outcome === 'failed') rs.login = 'blocked';
      const failed = decision({
        kind: 'note',
        rule: 'relogin',
        reason: `session expired and the re-login failed (${out.reason ?? 'unknown'})`,
        detail: {
          from_url: shapeUrl(from),
          outcome: out.outcome,
          reason: out.reason ?? null,
          at: out.at ?? null,
        },
      });
      return fail(
        [failed],
        new ToolError(
          'SESSION_LOST',
          `the session expired and logging in again failed (${out.reason}${out.at ? ` at ${out.at}` : ''})`,
          { reason: out.reason, ...(out.at ? { at: out.at } : {}) },
        ),
      );
    }
    const reports = [
      decision({
        kind: 'note',
        rule: 'relogin',
        reason: 'session expired; logged in again and returned to the target page',
        detail: { from_url: shapeUrl(from), to_url: shapeUrl(target) },
      }),
      event('relogin', { from_url: shapeUrl(from), to_url: shapeUrl(target) }),
    ];
    await orFail(reports, rs.session.goto(target));
    return reported(undefined, reports);
  });
}
