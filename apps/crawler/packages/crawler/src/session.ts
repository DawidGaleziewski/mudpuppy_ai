import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { EffectiveConfig } from '@pathfinder/config';
import { registerObstacleHandlers, type ObstacleHandlers } from '@pathfinder/obstacles';
import type { Refusal } from '@pathfinder/safety';
import { NetworkRecorder } from './network-recorder.js';
import { createRateLimiter, type RateLimiter } from './rate-limiter.js';
import { createRequestGate, type RequestGate, type StopEvent } from './request-gate.js';
import {
  settle,
  trackNetworkActivity,
  type NetworkActivity,
  type StabilizationResult,
  type StabilizerOptions,
} from './stabilizer.js';

export interface SessionOptions {
  effective: EffectiveConfig;
  /** Persist and react to a block (FR-008); called once. */
  onStop: (e: StopEvent) => void;
  /** Scope/denylist policy for browser-initiated main-frame navigations. */
  navigationPolicy?: (url: string) => Refusal | null;
  onNavigationRefused?: (url: string, refusal: Refusal) => void;
  headless?: boolean;
  stabilizer?: StabilizerOptions;
}

/** Non-production portals may omit `rate_limit`; be gentle anyway. */
const DEFAULT_RATE = {
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
  readonly popups: string[] = [];
  private constructor(
    readonly browser: Browser,
    readonly context: BrowserContext,
    readonly page: Page,
    readonly limiter: RateLimiter,
    readonly gate: RequestGate,
    readonly net: NetworkActivity,
    readonly recorder: NetworkRecorder,
    readonly obstacles: ObstacleHandlers,
    private readonly stabilizerOptions: StabilizerOptions,
  ) {}

  static async launch(opts: SessionOptions): Promise<BrowserSession> {
    const { portal, persona } = opts.effective;
    const rate = portal.rate_limit ?? DEFAULT_RATE;
    const browser = await chromium.launch({ headless: opts.headless ?? true });
    try {
      const context = await browser.newContext({
        viewport: persona.viewport,
        locale: persona.locale,
        userAgent: rate.user_agent,
        permissions: [],
        acceptDownloads: false,
        serviceWorkers: 'block',
      });
      const limiter = createRateLimiter({
        requestsPerSecond: rate.requests_per_second,
        maxConcurrency: rate.max_concurrency,
      });
      const gate = createRequestGate({
        limiter,
        userAgent: rate.user_agent,
        blockSignatures: portal.block_signatures,
        onStop: opts.onStop,
        ...(opts.navigationPolicy ? { navigationPolicy: opts.navigationPolicy } : {}),
        ...(opts.onNavigationRefused ? { onNavigationRefused: opts.onNavigationRefused } : {}),
      });
      await gate.install(context);
      const page = await context.newPage();
      const net = trackNetworkActivity(page);
      const recorder = new NetworkRecorder(page);
      const obstacles = await registerObstacleHandlers(page, portal.obstacles);
      const session = new BrowserSession(
        browser,
        context,
        page,
        limiter,
        gate,
        net,
        recorder,
        obstacles,
        opts.stabilizer ?? {},
      );
      // New tabs (target=_blank, window.open) are not followed: their URL is noted and the tab closed.
      context.on('page', (p) => {
        if (p === page) return;
        session.popups.push(p.url());
        void p.close().catch(() => undefined);
      });
      return session;
    } catch (e) {
      await browser.close().catch(() => undefined);
      throw e;
    }
  }

  /** Load a URL; the response status is returned but a failed load is not an exception. */
  async goto(url: string): Promise<number | null> {
    try {
      const res = await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      return res?.status() ?? null;
    } catch {
      return null; // aborted by the gate, timed out or refused; the caller checks `gate.stopped`
    }
  }

  /** Dismiss obstacles, then wait for the page to settle. */
  async settle(): Promise<StabilizationResult> {
    await this.obstacles.sweep();
    const result = await settle(this.page, this.net, this.stabilizerOptions);
    await this.obstacles.sweep();
    return result;
  }

  async close(): Promise<void> {
    this.limiter.halt();
    this.recorder.dispose();
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
