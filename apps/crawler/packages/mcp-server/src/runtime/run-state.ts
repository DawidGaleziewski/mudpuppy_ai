import { FingerprintIndex } from '@pathfinder/fingerprint';
import { inferRouteTemplates, type RouteTemplater } from '@pathfinder/fingerprint';
import type { EffectiveConfig, Scope } from '@pathfinder/config';
import { FrontierPolicy, type BrowserSession } from '@pathfinder/crawler';
import { portalRuleSet, type RuleSet } from '@pathfinder/safety';
import type { RunRobots } from '../services/robots.js';

/** In-memory, per-run browser-side state. Everything durable lives in the database. */
export class RunState {
  readonly index = new FingerprintIndex();
  readonly policy: FrontierPolicy;
  /** Built once per run from the portal file; every classification of this run uses it. */
  readonly ruleSet: RuleSet;
  readonly depthByState = new Map<string, number>();
  private readonly urls: string[] = [];
  private templater: RouteTemplater | null = null;
  currentStateId: string | null = null;
  currentUrl: string | null = null;
  /** Resolves when a detected block has been persisted; undefined until one is detected. */
  stopPersisted: Promise<void> | undefined;

  constructor(
    readonly runId: string,
    readonly session: BrowserSession,
    readonly effective: EffectiveConfig,
    readonly scope: Scope,
    readonly robots: RunRobots,
  ) {
    const { portal } = effective;
    this.ruleSet = portalRuleSet(portal);
    this.policy = new FrontierPolicy({
      itemRouteTemplates: portal.item_route_templates,
      ...(portal.item_view_cap !== undefined ? { itemViewCap: portal.item_view_cap } : {}),
    });
  }

  /**
   * Route template for a URL. A template the portal lists in `item_route_templates` (`/oferta/:id`) wins
   * for any URL it matches; otherwise it is inferred from every URL seen so far (research §2).
   */
  routeTemplateFor(url: string): string {
    const path = new URL(url).pathname;
    for (const t of this.effective.portal.item_route_templates) {
      const re = new RegExp(
        `^${t
          .split('/')
          .map((seg) =>
            seg.startsWith(':') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          )
          .join('/')}$`,
      );
      if (re.test(path)) return t;
    }
    if (!this.urls.includes(url)) {
      this.urls.push(url);
      this.templater = null;
    }
    this.templater ??= inferRouteTemplates(this.urls);
    return this.templater.templateFor(url);
  }
}
