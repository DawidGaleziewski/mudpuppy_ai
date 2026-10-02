import type { BrowserContext, Request, Response, Route } from 'playwright';
import { detectBlock, type BlockVerdict, type Refusal } from '@pathfinder/safety';
import { RateLimiterHalted, type RateLimiter } from './rate-limiter.js';
import type { RobotsCheck } from './robots-registry.js';

/** Structural subset of Playwright's BrowserContext, so the gate is testable without a browser. */
export interface GateContextLike {
  route(
    url: string,
    handler: (route: Route, request: Request) => Promise<void> | void,
  ): Promise<void>;
  on(event: 'response', handler: (response: Response) => void | Promise<void>): unknown;
}

export interface StopEvent {
  kind: NonNullable<BlockVerdict['kind']>;
  /** Warning text; the caller (run lifecycle) persists it and sets `stopped_warning`. */
  warning: string;
}

export interface RequestGateOptions {
  limiter: RateLimiter;
  /** Identifiable User-Agent from `rate_limit.user_agent` (FR-006). */
  userAgent: string;
  blockSignatures?: readonly string[];
  onStop: (e: StopEvent) => void;
  /**
   * Checked for every main-frame navigation request, including ones the page starts itself
   * (redirects, scripts, clicks): a refusal aborts the request. Returns the refusal or null.
   */
  navigationPolicy?: (url: string) => Refusal | null;
  onNavigationRefused?: (url: string, refusal: Refusal & { via?: 'request_gate' }) => void;
  /**
   * robots.txt enforcement (FR-003, FR-009). Every request to a host robots governs waits for that
   * host's policy; disallowed main-frame navigations (also redirect targets) are always aborted;
   * the page's own requests follow `pageRequests`. Omitted only in unit tests of other behaviour.
   */
  robots?: {
    registry: {
      inScope(url: string): boolean;
      ensure(url: string): Promise<unknown>;
      check(url: string): RobotsCheck;
    };
    pageRequests: 'block' | 'allow_and_record';
    /** URL template used to group notes (the run's route template); defaults to the path. */
    templateFor?: (url: string) => string;
    /** Called once per (template, rule, action); later occurrences only raise the count. */
    onNote?: (note: RobotsPageNote) => void;
  };
  /**
   * Observability hooks (spec 005). Called for every routed request, every robots check of a page
   * request, every response and every block verdict. They only observe: a hook that throws is
   * ignored and never changes what the gate does.
   */
  onRequestDecision?: (d: RequestDecision) => void;
  onRobotsCheck?: (c: { url: string; rule: string; action: 'blocked' | 'allowed' }) => void;
  onResponse?: (r: { url: string; status: number; resourceType: string }) => void;
  onBlockVerdict?: (v: { kind: string; warning: string; status: number; url: string }) => void;
  /** Clock for limiter waits; injectable for tests. */
  now?: () => number;
}

export interface RequestDecision {
  url: string;
  method: string;
  resourceType: string;
  mainFrame: boolean;
  decision: 'continue' | 'abort' | 'fulfill';
  reason?: 'navigation_policy' | 'robots' | 'redirect_refused' | 'limiter_halted';
  rule?: string;
  /** Set when a robots-disallowed page request was let through (`allow_and_record`). */
  robotsRule?: string;
  limiterWaitMs: number;
  status?: number;
  redirectTo?: string;
  failed?: string;
}

function safely<A>(fn: ((a: A) => void) | undefined, arg: A): void {
  if (!fn) return;
  try {
    fn(arg);
  } catch {
    // observers must never affect the gate
  }
}

/** A page's own request to a robots-disallowed URL (decision-log `note`, research §11). */
export interface RobotsPageNote {
  url: string;
  template: string;
  rule: string;
  action: 'blocked' | 'allowed';
}

export interface RobotsStats {
  refusedNavigations: number;
  pageRequestsBlocked: number;
  pageRequestsAllowed: number;
  notes: (Omit<RobotsPageNote, 'url'> & { count: number })[];
}

export interface RequestGate {
  install(context: GateContextLike | BrowserContext): Promise<void>;
  readonly stopped: StopEvent | null;
  /** robots counters for `finish_run` coverage. */
  robotsStats(): RobotsStats;
}

/** Minimal shape of the response `route.fetch` returns. */
interface FetchedLike {
  status(): number;
  headers(): Record<string, string>;
}

const TEXTUAL = /^(text\/|application\/(json|xhtml|xml))/i;

/** True for the top-level document, false for sub-resources and iframe documents. Unknown → true. */
function isMainFrameDocument(response: {
  request?: () => { resourceType?: () => string; frame?: () => { parentFrame?: () => unknown } };
}): boolean {
  const req = response.request?.();
  if (!req) return true;
  if (req.resourceType && req.resourceType() !== 'document') return false;
  return req.frame?.().parentFrame?.() == null;
}

/**
 * The single request choke point (FR-006, FR-008). Every request the browser makes passes through
 * the rate limiter and carries the configured User-Agent; every response is checked for a block, and
 * on detection the limiter is halted for good — no retry, no bypass.
 */
export function createRequestGate(opts: RequestGateOptions): RequestGate {
  const clock = opts.now ?? (() => performance.now());
  let stopped: StopEvent | null = null;
  const stats: RobotsStats = {
    refusedNavigations: 0,
    pageRequestsBlocked: 0,
    pageRequestsAllowed: 0,
    notes: [],
  };

  /** Loads the host's policy and returns the robots refusal for `url`, or null. */
  const robotsRefusal = async (
    url: string,
  ): Promise<(Refusal & { via: 'request_gate' }) | null> => {
    const r = opts.robots;
    if (!r || !r.registry.inScope(url)) return null;
    await r.registry.ensure(url);
    const c = r.registry.check(url);
    if (c.state !== 'refused') return null;
    return {
      status: 'robots_disallowed',
      rule: c.rule,
      reason: `robots.txt disallows ${url}`,
      policyId: c.policyId,
      via: 'request_gate',
    };
  };

  const refuseNavigation = (url: string, refusal: Refusal & { via?: 'request_gate' }): void => {
    if (refusal.status === 'robots_disallowed') stats.refusedNavigations += 1;
    opts.onNavigationRefused?.(url, refusal);
  };

  const notePageRequest = (url: string, rule: string, action: 'blocked' | 'allowed'): void => {
    const r = opts.robots!;
    safely(opts.onRobotsCheck, { url, rule, action });
    if (action === 'blocked') stats.pageRequestsBlocked += 1;
    else stats.pageRequestsAllowed += 1;
    let template: string;
    try {
      template = r.templateFor ? r.templateFor(url) : new URL(url).pathname;
    } catch {
      template = url;
    }
    const known = stats.notes.find(
      (n) => n.template === template && n.rule === rule && n.action === action,
    );
    if (known) {
      known.count += 1;
      return;
    }
    stats.notes.push({ template, rule, action, count: 1 });
    r.onNote?.({ url, template, rule, action });
  };

  const stop = (verdict: BlockVerdict): void => {
    if (stopped || !verdict.blocked || !verdict.kind || !verdict.warning) return;
    stopped = { kind: verdict.kind, warning: verdict.warning };
    opts.limiter.halt();
    opts.onStop(stopped);
  };

  return {
    get stopped() {
      return stopped;
    },
    robotsStats: () => ({ ...stats, notes: stats.notes.map((n) => ({ ...n })) }),
    async install(context) {
      const ctx = context as GateContextLike;
      await ctx.route('**/*', async (route, request) => {
        const url = request.url();
        const mainNav = request.isNavigationRequest() && request.frame().parentFrame() === null;
        let limiterWaitMs = 0;
        let robotsRule: string | undefined;
        const report = (
          d: Omit<
            RequestDecision,
            'url' | 'method' | 'resourceType' | 'mainFrame' | 'limiterWaitMs'
          >,
        ): void => {
          if (!opts.onRequestDecision) return;
          safely(opts.onRequestDecision, {
            url,
            method: request.method(),
            resourceType: request.resourceType(),
            mainFrame: mainNav,
            ...d,
            ...(robotsRule !== undefined ? { robotsRule } : {}),
            limiterWaitMs,
          });
        };
        const halted = (): Promise<void> => {
          report({ decision: 'abort', reason: 'limiter_halted' });
          return route.abort('blockedbyclient');
        };

        if (mainNav && opts.navigationPolicy) {
          const refusal = opts.navigationPolicy(url);
          if (refusal) {
            refuseNavigation(url, refusal);
            report({ decision: 'abort', reason: 'navigation_policy', rule: refusal.rule });
            return route.abort('blockedbyclient');
          }
        }
        try {
          const robots = await robotsRefusal(url);
          if (robots && mainNav) {
            refuseNavigation(url, robots);
            report({ decision: 'abort', reason: 'robots', rule: robots.rule });
            return route.abort('blockedbyclient');
          }
          if (robots) {
            const allow = opts.robots!.pageRequests === 'allow_and_record';
            notePageRequest(url, robots.rule, allow ? 'allowed' : 'blocked');
            if (!allow) {
              report({ decision: 'abort', reason: 'robots', rule: robots.rule });
              return route.abort('blockedbyclient');
            }
            robotsRule = robots.rule;
          }
        } catch (e) {
          if (e instanceof RateLimiterHalted) return halted();
          throw e;
        }
        let release: (() => void) | undefined;
        const waitStart = clock();
        try {
          release = await opts.limiter.acquire();
        } catch (e) {
          limiterWaitMs = clock() - waitStart;
          if (e instanceof RateLimiterHalted) return halted();
          throw e;
        }
        limiterWaitMs = clock() - waitStart;
        const headers = { ...request.headers(), 'user-agent': opts.userAgent };
        if (!(mainNav && opts.robots)) {
          try {
            await route.continue({ headers });
          } catch (e) {
            report({ decision: 'continue', failed: (e as Error).message });
            throw e;
          } finally {
            release();
          }
          report({ decision: 'continue' });
          return;
        }
        // Playwright calls route handlers only for the first URL of a redirect chain, so a
        // main-frame navigation is fetched here without following redirects, and a redirect's
        // target passes the navigation policy and robots before the browser may follow it.
        let response: FetchedLike;
        try {
          response = (await (route as Route).fetch({ headers, maxRedirects: 0 })) as FetchedLike;
        } catch (e) {
          report({ decision: 'fulfill', failed: (e as Error).message });
          throw e;
        } finally {
          release();
        }
        const location = response.headers()['location'];
        const status = response.status();
        let redirectTo: string | undefined;
        if (status >= 300 && status < 400 && location) {
          try {
            redirectTo = new URL(location, url).toString();
          } catch {
            redirectTo = location;
          }
          let refusal: (Refusal & { via?: 'request_gate' }) | null =
            opts.navigationPolicy?.(redirectTo) ?? null;
          try {
            refusal ??= await robotsRefusal(redirectTo);
          } catch (e) {
            if (e instanceof RateLimiterHalted) return halted();
            throw e;
          }
          if (refusal) {
            refuseNavigation(redirectTo, refusal);
            report({
              decision: 'abort',
              reason: 'redirect_refused',
              rule: refusal.rule,
              status,
              redirectTo,
            });
            return route.abort('blockedbyclient');
          }
        }
        await (route as Route).fulfill({ response: response as never });
        report({ decision: 'fulfill', status, ...(redirectTo ? { redirectTo } : {}) });
      });
      ctx.on('response', async (response) => {
        const headers = response.headers();
        const status = response.status();
        if (opts.onResponse) {
          safely(opts.onResponse, {
            url: response.url(),
            status,
            resourceType: response.request().resourceType(),
          });
        }
        let body: string | undefined;
        // Only the visited page can be a challenge page. A third-party script or a vendor iframe (the
        // reCAPTCHA loader that sits on every form of some portals) mentions the very markers we look for.
        if (
          status < 400 &&
          TEXTUAL.test(headers['content-type'] ?? '') &&
          isMainFrameDocument(response)
        ) {
          body = await response.text().catch(() => undefined);
        }
        const verdict = detectBlock(
          { url: response.url(), status, headers, body },
          opts.blockSignatures ?? [],
        );
        if (verdict.blocked && verdict.kind && verdict.warning) {
          safely(opts.onBlockVerdict, {
            kind: verdict.kind,
            warning: verdict.warning,
            status,
            url: response.url(),
          });
        }
        stop(verdict);
      });
    },
  };
}
