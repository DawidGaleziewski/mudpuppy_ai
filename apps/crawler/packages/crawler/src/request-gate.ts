import type { BrowserContext, Request, Response, Route } from 'playwright';
import { detectBlock, type BlockVerdict, type Refusal } from '@pathfinder/safety';
import { RateLimiterHalted, type RateLimiter } from './rate-limiter.js';

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
  onNavigationRefused?: (url: string, refusal: Refusal) => void;
}

export interface RequestGate {
  install(context: GateContextLike | BrowserContext): Promise<void>;
  readonly stopped: StopEvent | null;
}

const TEXTUAL = /^(text\/|application\/(json|xhtml|xml))/i;

/**
 * The single request choke point (FR-006, FR-008). Every request the browser makes passes through
 * the rate limiter and carries the configured User-Agent; every response is checked for a block, and
 * on detection the limiter is halted for good — no retry, no bypass.
 */
export function createRequestGate(opts: RequestGateOptions): RequestGate {
  let stopped: StopEvent | null = null;

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
    async install(context) {
      const ctx = context as GateContextLike;
      await ctx.route('**/*', async (route, request) => {
        if (
          opts.navigationPolicy &&
          request.isNavigationRequest() &&
          request.frame().parentFrame() === null
        ) {
          const refusal = opts.navigationPolicy(request.url());
          if (refusal) {
            opts.onNavigationRefused?.(request.url(), refusal);
            return route.abort('blockedbyclient');
          }
        }
        let release: (() => void) | undefined;
        try {
          release = await opts.limiter.acquire();
        } catch (e) {
          if (e instanceof RateLimiterHalted) return route.abort('blockedbyclient');
          throw e;
        }
        try {
          await route.continue({ headers: { ...request.headers(), 'user-agent': opts.userAgent } });
        } finally {
          release();
        }
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
