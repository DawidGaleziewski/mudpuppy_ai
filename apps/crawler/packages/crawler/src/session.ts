import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { EffectiveConfig } from '@pathfinder/config';
import {
  registerObstacleHandlers,
  type ObstacleEvent,
  type ObstacleHandlers,
} from '@pathfinder/obstacles';
import type { Refusal } from '@pathfinder/safety';
import { installClickSignals } from './click-signals.js';
import { NavigationRecorder } from './navigation-recorder.js';
import { NetworkRecorder } from './network-recorder.js';
import { createRateLimiter, type RateLimiter } from './rate-limiter.js';
import {
  createRequestGate,
  type RequestGate,
  type RequestGateOptions,
  type StopEvent,
} from './request-gate.js';
import {
  settleWithDiagnostics,
  trackNetworkActivity,
  type NetworkActivity,
  type NetworkActivityOptions,
  type SettleOutcome,
  type StabilizationResult,
  type StabilizerOptions,
} from './stabilizer.js';

export interface SessionOptions {
  effective: EffectiveConfig;
  /** Persist and react to a block (FR-008); called once. */
  onStop: (e: StopEvent) => void;
  /** Scope/denylist policy for browser-initiated main-frame navigations. */
  navigationPolicy?: (url: string) => Refusal | null;
  onNavigationRefused?: RequestGateOptions['onNavigationRefused'];
  /** The run's limiter, shared with the robots.txt fetches (spec 002 FR-001); created here if absent. */
  limiter?: RateLimiter;
  /** robots.txt enforcement for every request of the session (spec 002). */
  robots: NonNullable<RequestGateOptions['robots']>;
  /** The BA chose to skip images for this run (spec 011 FR-014). */
  skipImages?: RequestGateOptions['skipImages'];
  headless?: boolean;
  stabilizer?: StabilizerOptions;
  /** Observability hooks handed to the request gate (spec 005); they never change its behaviour. */
  observe?: Pick<
    RequestGateOptions,
    'onRequestDecision' | 'onRobotsCheck' | 'onResponse' | 'onBlockVerdict'
  > &
    NetworkActivityOptions;
}

/** What a launched session is made of (one object, not ten positional parameters: G-04). */
interface SessionParts {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  limiter: RateLimiter;
  gate: RequestGate;
  net: NetworkActivity;
  recorder: NetworkRecorder;
  navigation: NavigationRecorder;
  obstacles: ObstacleHandlers;
  stabilizerOptions: StabilizerOptions;
}

/** Static files per second when the portal sets no `rate_limit.static_per_second` (spec 030). */
export const DEFAULT_STATIC_PER_SECOND = 20;

/** A portal may omit `rate_limit` on any environment; be gentle anyway. */
export const DEFAULT_RATE_LIMIT = {
  requests_per_second: 2,
  max_concurrency: 2,
  user_agent: 'PathfinderAI-Crawler/0.1',
};

/**
 * Owns the ONLY Playwright instance (used in-process by the mcp-server): a browser context with the
 * persona's viewport/locale, the request gate on every request, obstacle handlers, and the network
 * recorder. Consent flags are honoured by never granting optional permissions (no geolocation,
 * notifications, camera) and by the portal's obstacle selectors dismissing banners (FR-023).
 */
export class BrowserSession {
  /** Every window the pages opened, by the URL it opened (`about:blank` when written by script). */
  readonly popups: string[] = [];
  private popupsTaken = 0;

  /** The windows opened since the last call: http(s) URLs only, a script-written window has none. */
  takeOpened(): string[] {
    const fresh = this.popups.slice(this.popupsTaken);
    this.popupsTaken = this.popups.length;
    return fresh.filter((u) => /^https?:/i.test(u));
  }
  readonly browser: Browser;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly limiter: RateLimiter;
  readonly gate: RequestGate;
  readonly net: NetworkActivity;
  readonly recorder: NetworkRecorder;
  /** Every URL and redirect hop of the main frame, per step (spec 019, R-38). */
  readonly navigation: NavigationRecorder;
  readonly obstacles: ObstacleHandlers;
  private readonly stabilizerOptions: StabilizerOptions;

  private constructor(parts: SessionParts) {
    this.browser = parts.browser;
    this.context = parts.context;
    this.page = parts.page;
    this.limiter = parts.limiter;
    this.gate = parts.gate;
    this.net = parts.net;
    this.recorder = parts.recorder;
    this.navigation = parts.navigation;
    this.obstacles = parts.obstacles;
    this.stabilizerOptions = parts.stabilizerOptions;
  }

  static async launch(opts: SessionOptions): Promise<BrowserSession> {
    const { portal, persona } = opts.effective;
    const rate = portal.rate_limit ?? DEFAULT_RATE_LIMIT;
    const browser = await chromium.launch({ headless: opts.headless ?? true });
    try {
      const context = await browser.newContext({
        viewport: persona.viewport,
        locale: persona.locale,
        userAgent: rate.user_agent,
        permissions: [],
        acceptDownloads: false,
        serviceWorkers: 'block',
        // A corporate proxy and TLS inspection (spec 030 R-63): only when the portal says so.
        ...(portal.network?.proxy
          ? {
              proxy: {
                server: portal.network.proxy.server,
                ...(portal.network.proxy.bypass.length > 0
                  ? { bypass: portal.network.proxy.bypass.join(',') }
                  : {}),
              },
            }
          : {}),
        ...(portal.network?.ignore_https_errors ? { ignoreHTTPSErrors: true } : {}),
      });
      const limiter =
        opts.limiter ??
        createRateLimiter({
          requestsPerSecond: rate.requests_per_second,
          maxConcurrency: rate.max_concurrency,
        });
      const gate = createRequestGate({
        limiter,
        staticLimiter: createRateLimiter({
          requestsPerSecond: portal.rate_limit?.static_per_second ?? DEFAULT_STATIC_PER_SECOND,
          maxConcurrency: Math.max(rate.max_concurrency, 4),
        }),
        userAgent: rate.user_agent,
        blockSignatures: portal.block_signatures,
        onStop: opts.onStop,
        ...(opts.navigationPolicy ? { navigationPolicy: opts.navigationPolicy } : {}),
        ...(opts.onNavigationRefused ? { onNavigationRefused: opts.onNavigationRefused } : {}),
        robots: opts.robots,
        ...(opts.skipImages ? { skipImages: opts.skipImages } : {}),
        ...(opts.observe?.onRequestDecision
          ? { onRequestDecision: opts.observe.onRequestDecision }
          : {}),
        ...(opts.observe?.onRobotsCheck ? { onRobotsCheck: opts.observe.onRobotsCheck } : {}),
        ...(opts.observe?.onResponse ? { onResponse: opts.observe.onResponse } : {}),
        ...(opts.observe?.onBlockVerdict ? { onBlockVerdict: opts.observe.onBlockVerdict } : {}),
      });
      await gate.install(context);
      // Before the first page: the listener record must exist before the page's scripts run.
      await installClickSignals(context);
      const page = await context.newPage();
      const net = trackNetworkActivity(
        page,
        Date.now,
        opts.observe?.onRequestFailed ? { onRequestFailed: opts.observe.onRequestFailed } : {},
      );
      const recorder = new NetworkRecorder(page);
      const navigation = new NavigationRecorder(page);
      // Their in-page probes (form submits, meta refresh) must be in place before the first page.
      await Promise.all([recorder.ready, navigation.ready]);
      const obstacles = await registerObstacleHandlers(page, portal.obstacles);
      const session = new BrowserSession({
        browser,
        context,
        page,
        limiter,
        gate,
        net,
        recorder,
        navigation,
        obstacles,
        stabilizerOptions: opts.stabilizer ?? {},
      });
      // New tabs (target=_blank, window.open) are not followed in the browser: the URL each one
      // opens is noted and the tab closed; the run visits a noted URL in its own tab later (LO-27).
      // A pop-up's first request comes before its frame exists (Playwright throws on `frame()`):
      // its URL names the window when the window itself has not committed (refused, still loading).
      const unclaimed: string[] = [];
      context.on('request', (r) => {
        if (!r.isNavigationRequest()) return;
        try {
          r.frame();
        } catch {
          unclaimed.push(r.url());
        }
      });
      context.on('page', (p) => {
        if (p === page) return;
        const first = unclaimed.shift();
        session.popups.push(p.url() === 'about:blank' && first ? first : p.url());
        void p.close().catch(() => undefined);
      });
      return session;
    } catch (e) {
      await browser.close().catch(() => undefined);
      throw e;
    }
  }

  /** Load a URL; the response status is returned but a failed load is not an exception. */
  /**
   * The network error of the last `goto` that could not open its page (`net::ERR_CONNECTION_REFUSED`,
   * a name that does not resolve, …); null after a page opened or the gate itself blocked it.
   */
  lastNavigationError: string | null = null;

  /** `timeoutMs`: the page's navigation timeout (spec 023 US4); 30 s by default. */
  async goto(url: string, timeoutMs = 30_000): Promise<number | null> {
    this.lastNavigationError = null;
    try {
      const res = await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      return res?.status() ?? null;
    } catch (e) {
      // Aborted by the gate, timed out or refused; the caller checks `gate.stopped`. A network
      // error is kept so `navigate` can say the address could not be opened (spec 011 F-06).
      const net = /net::ERR_[A-Z_]+/.exec((e as Error).message)?.[0];
      if (net !== undefined && net !== 'net::ERR_BLOCKED_BY_CLIENT') this.lastNavigationError = net;
      return null;
    }
  }

  /** Dismiss obstacles, then wait for the page to settle. */
  async settle(): Promise<StabilizationResult> {
    return (await this.settleTraced()).result;
  }

  /**
   * {@link settle}, plus settle diagnostics and the obstacles the two sweeps dismissed.
   * `timeoutMs` overrides the settle timeout for this page (spec 023 US4).
   */
  async settleTraced(timeoutMs?: number): Promise<SettleOutcome & { obstacles: ObstacleEvent[] }> {
    const before = await this.obstacles.sweep();
    const options =
      timeoutMs === undefined ? this.stabilizerOptions : { ...this.stabilizerOptions, timeoutMs };
    const outcome = await settleWithDiagnostics(this.page, this.net, options);
    const after = await this.obstacles.sweep();
    return { ...outcome, obstacles: [...before, ...after] };
  }

  async close(): Promise<void> {
    this.limiter.halt();
    this.recorder.dispose();
    this.navigation.dispose();
    this.net.dispose();
    await this.browser.close().catch(() => undefined);
  }
}

/** True when a headless Chromium can start here (needs `playwright install --with-deps chromium`). */
export async function canLaunchBrowser(): Promise<boolean> {
  try {
    const b = await chromium.launch();
    await b.close();
    return true;
  } catch {
    return false;
  }
}
