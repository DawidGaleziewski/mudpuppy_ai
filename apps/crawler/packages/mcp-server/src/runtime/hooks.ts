// The portal's hooks in a run (spec 023 US1, US2): loaded before the run starts, adapted to the
// run's browser, every run a `hook` trace span and a decision note. A failing hook is recorded and
// the crawl goes on. A portal without `hooks:` costs nothing (the runner has no hook to run).

import {
  createHookRunner,
  type HookBrowser,
  type HookOutcome,
  type HookRun,
  type HookRunner,
  type LoadedHook,
} from '@pathfinder/hooks';
import type { Attrs } from '@pathfinder/store';
import type { ServerContext } from '../context.js';
import type { RunState } from './run-state.js';

/** Playwright's context and page behind the hooks' browser interface. */
function browserOf(rs: RunState): HookBrowser {
  const { context, page } = rs.session;
  return {
    getCookies: () => context.cookies(),
    addCookies: (cookies) => context.addCookies(cookies),
    clearCookies: () => context.clearCookies(),
    route: async (pattern, handler) => {
      await context.route(pattern, handler as never);
    },
    addInitScript: async (script) => {
      await context.addInitScript(script as never);
    },
    // Playwright sends a function as its source anyway; this keeps several arguments (it takes one).
    evaluate: (fn, ...args) =>
      page.evaluate(`(${fn.toString()}).apply(null, ${JSON.stringify(args)})`) as never,
  };
}

function reasonOf(run: HookRun): string {
  const did = run.did.length > 0 ? ` (${run.did.join(', ')})` : '';
  return `${run.outcome}${run.detail ? `: ${run.detail}` : ''}${did}`;
}

/** The run's hook runner: traced, recorded in the decision log, never fatal. */
export function runHooks(
  ctx: ServerContext,
  rs: RunState,
  hooks: readonly LoadedHook[],
): HookRunner {
  const { effective } = rs;
  return createHookRunner({
    hooks,
    browser: browserOf(rs),
    base: {
      persona: { id: effective.persona.id, attributes: {} },
      environment: effective.portal.environment,
      run: { id: rs.runId, mode: rs.isTrace ? 'trace' : 'map' },
      config: effective.portal,
    },
    trace: (attrs, run) =>
      ctx.tracer.phase(
        'hook',
        async (span) => {
          const result = await run();
          span.set(result as Attrs);
          span.setSummary(`hook:${attrs.point}:${attrs.fn} ${(result as HookRun).outcome}`);
          return result;
        },
        { ...attrs },
      ),
    onRun: (run) => {
      if (run.outcome === 'failed' || run.outcome === 'timeout')
        ctx.logger.warn({ run_id: rs.runId, hook: run.fn, point: run.point }, 'hook failed');
      void ctx.decisions
        .record({
          run_id: rs.runId,
          kind: 'note',
          rule: `hook:${run.point}:${run.fn}`,
          reason: reasonOf(run),
          ...(run.url ? { subject_ref: run.url } : {}),
          detail: { outcome: run.outcome, ms: run.ms, did: run.did, log: run.log },
        })
        .catch((err: unknown) => ctx.logger.error({ err }, 'failed to log a hook run'));
    },
  });
}

/** `onPageLoad` (spec 023 US1.3): loaded, not yet settled or observed; null when no hook is mapped. */
export async function runPageLoadHooks(rs: RunState): Promise<HookOutcome | null> {
  return rs.hooks?.has('onPageLoad')
    ? await rs.hooks.run('onPageLoad', rs.session.page.url())
    : null;
}

/**
 * Mark the state a page hook changed, so the BA does not document a patch as the portal's own.
 * Nothing is written when no hook ran or none changed the page.
 */
export async function notePatched(
  ctx: ServerContext,
  rs: RunState,
  stateId: string,
  pageHooks: HookOutcome | null,
): Promise<void> {
  if (!pageHooks?.patched) return;
  const fns = pageHooks.runs.filter((r) => r.did.length > 0).map((r) => r.fn);
  await ctx.decisions.record({
    run_id: rs.runId,
    kind: 'note',
    rule: 'hook:patched',
    reason: `patched by hook ${fns.join(', ')} before it was observed: what the hook changed is not the portal's own behaviour`,
    subject_ref: stateId,
    detail: { state_id: stateId, hooks: [...fns] },
  });
}
