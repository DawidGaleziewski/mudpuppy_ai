import type { ServerContext } from '../../context.js';
import type { PageResult } from '../../runtime.js';
import { loginPreconditions, performLogin } from '../login.js';
import type { RunState } from '../run-state.js';
import { counted, decision, flushObstacles, phase, reported, step } from './context.js';
import { processPage } from './process-page.js';
import { beginStep, bumpRun } from './stop.js';

const LOGIN_NOTES = {
  logged_in: () => 'logged in with vault credentials',
  failed: (reason?: string) => `login failed (${reason}); no further login attempt in this run`,
  pending: (_reason?: string, at?: string) =>
    `login undecided: the page stopped moving with no success or failure sign (at ${at ?? '?'}); another login may follow`,
} as const;

/**
 * `login` (contracts/login-tool.md): the server fills and submits the portal's login form from
 * the vault; the agent gets the outcome and the landing page, never a value.
 */
export async function login(
  ctx: ServerContext,
  rs: RunState | undefined,
  input: { run_id: string },
): Promise<
  PageResult & {
    outcome: 'logged_in' | 'failed' | 'pending';
    reason?: string;
    /** Hosts other than the portal's the login passed through (spec 037 FR-004). */
    transit_hosts?: string[];
  }
> {
  const run = await phase(ctx, 'begin_step', () => beginStep(ctx, rs, input.run_id));
  const state = rs!;
  return counted(state, async () => {
    const started = performance.now();
    const creds = loginPreconditions(state);
    const out = await step({ ctx, run }, 'login', async () => {
      state.session.navigation.begin(state.session.page.url());
      const out = await performLogin(ctx, state, creds);
      // `pending` changes nothing: the agent may log in again (spec 030 FR-062, owner D-2 Q2).
      if (out.outcome !== 'pending')
        state.login = out.outcome === 'logged_in' ? 'logged_in' : 'blocked';
      // The hosts this login passed through (learned transit zone, spec 037 FR-004).
      const transit = [...(state.transit?.hosts ?? [])];
      return reported({ ...out, transit }, [
        decision({
          kind: 'note',
          rule: 'login',
          reason: LOGIN_NOTES[out.outcome](out.reason, out.at),
          detail: {
            outcome: out.outcome,
            reason: out.reason ?? null,
            at: out.at ?? null,
            transit_hosts: transit,
            transit_pages: state.transit?.pages.length ?? 0,
          },
        }),
      ]);
    });
    const page = await processPage({
      ctx,
      run,
      rs: state,
      via: { kind: 'navigate' },
      depth: 0,
      visitVia: 'login',
    });
    await step({ ctx, run }, 'run_bookkeeping', () => bumpRun(ctx, run, started, 0));
    await flushObstacles(ctx, state);
    return {
      ...page,
      outcome: out.outcome,
      ...(out.reason ? { reason: out.reason } : {}),
      ...(out.transit.length > 0 ? { transit_hosts: out.transit } : {}),
    };
  });
}
