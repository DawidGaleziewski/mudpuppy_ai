// Run a point's hooks (spec 023 FR-004..FR-006): the matching hooks in file order, each time-boxed
// and recorded with what it did. A throw, a timeout or a return outside the point's contract is a
// recorded failure; the crawl goes on. For `onBeforePageLoad` / `onBeforeClickAction` the first
// `skip` wins and stops the point; a `{ url }` rewrite is seen by the hooks after it.

import type { HookPoint } from '@pathfinder/config';
import type { LoadedHook } from './load.js';
import { HookResult, type HookAction, type HookBrowser, type HookContext } from './types.js';

export type HookRunOutcome = 'ok' | 'skip' | 'rewrite' | 'wait' | 'failed' | 'timeout';

export interface HookRun {
  point: HookPoint;
  fn: string;
  url: string;
  ms: number;
  outcome: HookRunOutcome;
  /** The failure, the skip reason, the new URL or the selector to wait for. */
  detail: string | null;
  /** What the hook changed: "cookies.add 1", "addInitScript", "route /api/*", "inPage". */
  did: string[];
  log: string[];
}

export interface HookOutcome {
  runs: HookRun[];
  skip: { fn: string; reason: string } | null;
  url: string | null;
  waitFor: string | null;
  /** A hook changed the page or the browser (cookies, scripts, routes, in-page code). */
  patched: boolean;
}

/** The context parts that do not change per run. */
export type HookBase = Pick<HookContext, 'persona' | 'environment' | 'run' | 'config'>;

export interface HookRunnerDeps {
  hooks: readonly LoadedHook[];
  browser: HookBrowser;
  base: HookBase;
  /** Wraps one hook run (the MCP server opens a `hook` trace span here). */
  trace?: <T>(
    attrs: { point: HookPoint; fn: string; url: string },
    run: () => Promise<T>,
  ) => Promise<T>;
  /** Called after each run (the MCP server records the decision and the span attributes). */
  onRun?: (run: HookRun) => void;
}

class HookTimeout extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HookTimeout(`no answer within ${String(ms)} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** The context one hook gets, with every browser call recorded in `did`. */
function contextFor(
  deps: HookRunnerDeps,
  call: { point: HookPoint; url: string; action: HookAction | undefined },
  record: { did: string[]; log: string[] },
): HookContext {
  const b = deps.browser;
  const { point, url, action } = call;
  const { did, log } = record;
  return {
    ...deps.base,
    point,
    url,
    ...(action ? { action } : {}),
    cookies: {
      get: () => b.getCookies(),
      add: async (cookies) => {
        did.push(`cookies.add ${String(cookies.length)}`);
        await b.addCookies(cookies);
      },
      clear: async () => {
        did.push('cookies.clear');
        await b.clearCookies();
      },
    },
    route: async (pattern, handler) => {
      did.push(`route ${String(pattern)}`);
      await b.route(pattern, handler);
    },
    addInitScript: async (script) => {
      did.push('addInitScript');
      await b.addInitScript(script);
    },
    inPage: async (fn, ...args) => {
      did.push('inPage');
      return b.evaluate(fn, ...args);
    },
    log: (message) => {
      log.push(String(message).slice(0, 500));
    },
  };
}

function classify(point: HookPoint, value: unknown): Pick<HookRun, 'outcome' | 'detail'> {
  const parsed = HookResult[point].safeParse(value);
  if (!parsed.success)
    return {
      outcome: 'failed',
      detail: `returned ${JSON.stringify(value)?.slice(0, 200)}, which ${point} does not take`,
    };
  const v = parsed.data as Record<string, unknown> | null | undefined;
  if (v && 'skip' in v) return { outcome: 'skip', detail: String(v['reason']) };
  if (v && 'url' in v) return { outcome: 'rewrite', detail: String(v['url']) };
  if (v && 'waitFor' in v) return { outcome: 'wait', detail: String(v['waitFor']) };
  return { outcome: 'ok', detail: null };
}

async function runOne(
  deps: HookRunnerDeps,
  hook: LoadedHook,
  point: HookPoint,
  url: string,
  action: HookAction | undefined,
): Promise<HookRun> {
  const did: string[] = [];
  const log: string[] = [];
  const started = performance.now();
  const body = async (): Promise<Pick<HookRun, 'outcome' | 'detail'>> => {
    try {
      const value = await withTimeout(
        Promise.resolve(hook.fn(contextFor(deps, { point, url, action }, { did, log }))),
        hook.spec.timeout_ms,
      );
      return classify(point, value);
    } catch (err) {
      if (err instanceof HookTimeout) return { outcome: 'timeout', detail: err.message };
      return { outcome: 'failed', detail: (err as Error)?.message ?? String(err) };
    }
  };
  const traced = deps.trace ?? ((_attrs, run) => run());
  const result = await traced({ point, fn: hook.spec.fn, url }, body);
  const run: HookRun = {
    point,
    fn: hook.spec.fn,
    url,
    ms: Math.round(performance.now() - started),
    ...result,
    did,
    log,
  };
  deps.onRun?.(run);
  return run;
}

export interface HookRunner {
  /** Whether any hook is mapped to `point` (callers skip the work when none is). */
  has(point: HookPoint): boolean;
  run(point: HookPoint, url: string, action?: HookAction): Promise<HookOutcome>;
}

export function createHookRunner(deps: HookRunnerDeps): HookRunner {
  return {
    has: (point) => deps.hooks.some((h) => h.spec.point === point),
    async run(point, url, action) {
      const outcome: HookOutcome = {
        runs: [],
        skip: null,
        url: null,
        waitFor: null,
        patched: false,
      };
      let current = url;
      for (const hook of deps.hooks) {
        if (hook.spec.point !== point || !hook.matches(current)) continue;
        const run = await runOne(deps, hook, point, current, action);
        outcome.runs.push(run);
        if (run.did.length > 0) outcome.patched = true;
        if (run.outcome === 'skip') {
          outcome.skip = { fn: run.fn, reason: run.detail ?? '' };
          break;
        }
        if (run.outcome === 'rewrite' && run.detail) {
          outcome.url = run.detail;
          current = run.detail;
        }
        if (run.outcome === 'wait' && run.detail) outcome.waitFor = run.detail;
      }
      return outcome;
    },
  };
}
