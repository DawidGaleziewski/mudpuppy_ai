import type { ServerContext } from '../../context.js';
import type { PageResult } from '../../runtime.js';
import { loginPreconditions, performLogin } from '../login.js';
import type { RunState } from '../run-state.js';
import { counted, decision, flushObstacles, phase, reported, step } from './context.js';
import { processPage } from './process-page.js';
import { beginStep, bumpRun } from './stop.js';

/**
 * `login` (contracts/login-tool.md): the server fills and submits the portal's login form from
 * the vault; the agent gets the outcome and the landing page, never a value.
 */
export async function login(
  ctx: ServerContext,
  rs: RunState | undefined,
  input: { run_id: string },
): Promise<PageResult & { outcome: 'logged_in' | 'failed'; reason?: string }> {
  const run = await phase(ctx, 'begin_step', () => beginStep(ctx, rs, input.run_id));
  const state = rs!;
  return counted(state, async () => {
    const started = performance.now();
    const creds = loginPreconditions(state);
    const out = await step({ ctx, run }, 'login', async () => {
      state.session.navigation.begin(state.session.page.url());
      const out = await performLogin(ctx, state, creds);
      state.login = out.outcome === 'logged_in' ? 'logged_in' : 'blocked';
      return reported(out, [
        decision({
          kind: 'note',
          rule: 'login',
          reason:
            out.outcome === 'logged_in'
              ? 'logged in with vault credentials'
              : `login failed (${out.reason}); no further login attempt in this run`,
          detail: { outcome: out.outcome, reason: out.reason ?? null },
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
    return { ...page, outcome: out.outcome, ...(out.reason ? { reason: out.reason } : {}) };
  });
}
