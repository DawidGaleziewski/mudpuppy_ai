import { FingerprintIndex, type FormStepIndex } from '@pathfinder/fingerprint';
import { inferRouteTemplates, type RouteTemplater } from '@pathfinder/fingerprint';
import type { EffectiveConfig } from '@pathfinder/config';
import {
  FrontierPolicy,
  type AssetHealth,
  type BrowserSession,
  type MountWait,
} from '@pathfinder/crawler';
import { portalRuleSet, type RuleSet, type RunScope } from '@pathfinder/safety';
import type { HookRunner } from '@pathfinder/hooks';
import type { RunRobots } from '../services/robots.js';
import type { ResolvedPlan } from '../services/run-plan.js';
import type { PwTrace } from './pw-trace.js';
import type { RunTraceHooks } from './trace-hooks.js';

/** One acted step on the way to a state: the issued action and the value typed or chosen. */
export interface PathStep {
  actionId: string;
  value: string | null;
  /** What map-mode autofill typed before this press, by label (the suite repeats it, spec 032). */
  fills?: { name: string; kind: 'fill' | 'select' | 'check'; value?: string }[];
  /** The state the step led to: a replay checks it (spec 034 checkpoints). */
  toState?: string;
}

export interface RunPath {
  url: string;
  steps: PathStep[];
}

/** In-memory, per-run browser-side state. Everything durable lives in the database. */
export class RunState {
  readonly index = new FingerprintIndex();
  readonly policy: FrontierPolicy;
  /** Built once per run from the portal file; every classification of this run uses it. */
  readonly ruleSet: RuleSet;
  readonly depthByState = new Map<string, number>();
  /** The shallowest depth each URL was observed at, so `navigate` back to it keeps that depth. */
  readonly depthByUrl = new Map<string, number>();
  private readonly urls: string[] = [];
  private templater: RouteTemplater | null = null;
  currentStateId: string | null = null;
  currentUrl: string | null = null;
  /** Route of the last page with a real URL: Chromium's own error page takes it (spec 036 FR-002). */
  lastPageRoute: string | null = null;
  /** Per-call Playwright trace chunks; null when not recorded for this run (research §13). */
  pw: PwTrace | null = null;
  /** Resolves when a detected block has been persisted; undefined until one is detected. */
  stopPersisted: Promise<void> | undefined;
  /** `session.obstacles.events` already reported for the current call (research §16). */
  obstacleCursor = 0;
  /** Trace runs (spec 004 R-14): the run's process; null for map runs. */
  processId: string | null = null;
  /** A probe run (spec 032 US5): it visits marked form steps, it does not explore. */
  isProbe = false;
  /** A directed run's plan (spec 034 R-66): what it may queue; null for a plain run. */
  plan: ResolvedPlan | null = null;
  /**
   * While `go_to_state` replays a recorded path (spec 034 A-2): pages on the way are recorded but
   * not queued, only the target's actions are; depth and the depth limit do not apply.
   */
  replay: { target: string; route?: string; cluster?: string } | null = null;
  /** The page as last observed, compared with the next one for a trace step's outcomes. */
  lastObserved: { url: string; title: string; snapshot: string } | null = null;
  /** The mount wait of the latest settle (spec 015 R4), for the page composition. */
  lastMounts: MountWait | null = null;
  /** States already handed to a human for a CAPTCHA in this run (spec 009 FR-022). */
  readonly handoffs = new Set<string>();
  /**
   * Server-side login (spec 009 FR-018, FR-020): `blocked` after any failure, so a wrong
   * password is tried once per run (lockout guard); `logged_in` arms re-login on expiry.
   */
  login: 'none' | 'logged_in' | 'blocked' = 'none';
  /** True while the server itself is logging in, so the login page is not a trace step. */
  loggingIn = false;
  /** The portal's hooks for this run (spec 023); null until the session is open. */
  hooks: HookRunner | null = null;
  /** Stylesheets, scripts and fonts that failed since the last page (spec 030 FR-041). */
  assets: AssetHealth | null = null;
  /** The portal's form steps (spec 032 US1), loaded from the store on the first form of the run. */
  formSteps: FormStepIndex | null = null;
  /** True while a technical probe's fault is armed: the error page is not re-opened (spec 032). */
  keepErrorPages = false;
  /** Each state's form step, as assigned in this run (spec 032). */
  readonly stepOfState = new Map<string, string>();
  /**
   * How the run reached each state (spec 032 plan decision 4): the URL of the last `navigate` and
   * the acted steps since then. Kept in memory for the run only; R-66 makes it durable.
   */
  readonly pathTo = new Map<string, RunPath>();
  /**
   * Form probing per step state (spec 032): the tries done and where the happy values led, so a
   * `probe_form` that stopped at its time limit continues on the next call.
   */
  readonly probing = new Map<
    string,
    { done: Set<string>; happyNext: { stepId: string | null; route: string } }
  >();

  get isTrace(): boolean {
    return this.processId !== null;
  }

  readonly runId: string;
  readonly session: BrowserSession;
  readonly effective: EffectiveConfig;
  readonly scope: RunScope;
  readonly robots: RunRobots;
  /** Request-level trace events of this run's browser (spec 005). */
  readonly trace: RunTraceHooks;

  /** Named parts instead of six positional ones (G-04, spec 030 close-out review). */
  constructor(parts: {
    runId: string;
    session: BrowserSession;
    effective: EffectiveConfig;
    scope: RunScope;
    robots: RunRobots;
    trace: RunTraceHooks;
  }) {
    this.runId = parts.runId;
    this.session = parts.session;
    this.effective = parts.effective;
    this.scope = parts.scope;
    this.robots = parts.robots;
    this.trace = parts.trace;
    const { portal } = parts.effective;
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
    const item = this.itemTemplateOf(url);
    if (item) return item;
    if (!this.urls.includes(url)) {
      this.urls.push(url);
      this.templater = null;
    }
    this.templater ??= inferRouteTemplates(this.urls);
    return this.templater.templateFor(url);
  }

  /**
   * Route template for trace URL shaping only: never adds the URL to the inference set, so tracing
   * cannot change the templates the crawl records (FR-014).
   */
  peekRouteTemplate(url: string): string {
    const item = this.itemTemplateOf(url);
    if (item) return item;
    this.templater ??= inferRouteTemplates(this.urls);
    return this.templater.templateFor(url);
  }

  private itemTemplateOf(url: string): string | undefined {
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
    return undefined;
  }
}
