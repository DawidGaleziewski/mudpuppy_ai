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

/**
 * The single request choke point (FR-006, FR-008). Every request the browser makes passes through
 * the rate limiter and carries the configured User-Agent; every response is checked for a block, and
 * on detection the limiter is halted for good — no retry, no bypass.
 */
export function createRequestGate(opts: RequestGateOptions): RequestGate {
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
        if (mainNav && opts.navigationPolicy) {
          const refusal = opts.navigationPolicy(url);
          if (refusal) {
            refuseNavigation(url, refusal);
            return route.abort('blockedbyclient');
          }
        }
        try {
          const robots = await robotsRefusal(url);
          if (robots && mainNav) {
            refuseNavigation(url, robots);
            return route.abort('blockedbyclient');
          }
          if (robots) {
            const allow = opts.robots!.pageRequests === 'allow_and_record';
            notePageRequest(url, robots.rule, allow ? 'allowed' : 'blocked');
            if (!allow) return route.abort('blockedbyclient');
          }
        } catch (e) {
          if (e instanceof RateLimiterHalted) return route.abort('blockedbyclient');
          throw e;
        }
        let release: (() => void) | undefined;
        try {
          release = await opts.limiter.acquire();
        } catch (e) {
          if (e instanceof RateLimiterHalted) return route.abort('blockedbyclient');
          throw e;
        }
        const headers = { ...request.headers(), 'user-agent': opts.userAgent };
        if (!(mainNav && opts.robots)) {
          try {
            await route.continue({ headers });
          } finally {
            release();
          }
          return;
        }
        // Playwright calls route handlers only for the first URL of a redirect chain, so a
        // main-frame navigation is fetched here without following redirects, and a redirect's
        // target passes the navigation policy and robots before the browser may follow it.
        let response: FetchedLike;
        try {
          response = (await (route as Route).fetch({ headers, maxRedirects: 0 })) as FetchedLike;
        } finally {
          release();
        }
        const location = response.headers()['location'];
        const status = response.status();
        if (status >= 300 && status < 400 && location) {
          let target: string;
          try {
            target = new URL(location, url).toString();
          } catch {
            target = location;
          }
          let refusal: (Refusal & { via?: 'request_gate' }) | null =
            opts.navigationPolicy?.(target) ?? null;
          try {
            refusal ??= await robotsRefusal(target);
          } catch (e) {
            if (e instanceof RateLimiterHalted) return route.abort('blockedbyclient');
            throw e;
          }
          if (refusal) {
            refuseNavigation(target, refusal);
            return route.abort('blockedbyclient');
          }
        }
        await (route as Route).fulfill({ response: response as never });
      });
      ctx.on('response', async (response) => {
        const headers = response.headers();
        const status = response.status();
        let body: string | undefined;
        if (status < 400 && TEXTUAL.test(headers['content-type'] ?? '')) {
          body = await response.text().catch(() => undefined);
        }
        stop(
          detectBlock({ url: response.url(), status, headers, body }, opts.blockSignatures ?? []),
        );
      });
    },
  };
}
