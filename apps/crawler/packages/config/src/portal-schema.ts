import { z } from 'zod';
import { SafetyClass, maxSafetyClass } from '@pathfinder/core';
import { BUILTIN_RULE_CLASSES, DENYLIST_RULE_IDS, RULE_ALIASES } from './rule-ids.js';
import { urlEntryProblem } from './url-entry.js';

/**
 * An environment name, declared by the user per portal (spec 030 R-61, owner D-1): any short
 * lowercase name (`dev`, `acceptance`, `live`, `sandbox`, …). No name has a meaning of its own;
 * each environment's limit is its `max_action_class`. The single definition: store, vault, MCP
 * tools and the chat model take this one.
 */
export const Environment = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,39}$/, 'must be a short lowercase name (letters, digits, -)');
export type Environment = z.infer<typeof Environment>;

const Slug = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'must be a lowercase slug');
const PositiveInt = z.number().int().positive();

/** `path:` / `url:` denylist entries moved to `urls.disallowed` (spec 023 US3.5). */
const MOVED_TO_URLS = 'URL and path entries moved to urls.disallowed (spec 023)';

/**
 * A known rule id; unknown free text is rejected, never silently ignored. URLs and paths are
 * excluded with `urls.disallowed` (spec 023).
 */
export const DenylistEntry = z.string().superRefine((v, ctx) => {
  // A slug may be the portal's own `action_rules` id; checked against the file in PortalConfig.
  if (DENYLIST_RULE_IDS.includes(v) || /^[a-z0-9][a-z0-9_-]*$/.test(v)) return;
  ctx.addIssue({
    code: 'custom',
    message:
      v.startsWith('path:') || v.startsWith('url:')
        ? `${JSON.stringify(v)}: ${MOVED_TO_URLS}`
        : `${JSON.stringify(v)} must be a rule id (rule ids: ${DENYLIST_RULE_IDS.join(', ')})`,
  });
});

const UrlEntry = z.string().superRefine((v, ctx) => {
  const problem = urlEntryProblem(v);
  if (problem !== null) ctx.addIssue({ code: 'custom', message: problem });
});

/**
 * Which URLs a portal (or a persona, narrowing) may scan (spec 023 US3): `allowed` absent means
 * every URL inside `scope.allowed_domains`; once set, only matching URLs; `disallowed` wins.
 * Entries: a path glob (`/konto/*`), an absolute URL glob, or a `/regex/` on the full URL.
 */
export const UrlLists = z
  .object({
    allowed: z.array(UrlEntry).min(1).optional(),
    disallowed: z.array(UrlEntry).default([]),
  })
  .strict();
export type UrlLists = z.infer<typeof UrlLists>;

const TimeoutValues = {
  /** Longest wait for a page to settle (network and DOM quiet), ms. Default 10000. */
  settle_ms: z.number().int().min(500).max(120_000).optional(),
  /** Longest wait for a navigation to answer, ms. Default 30000. */
  navigation_ms: z.number().int().min(1_000).max(180_000).optional(),
  /** Micro-frontend mount wait, ms; default `scope.mfe_wait_ms`. */
  mfe_wait_ms: z.number().int().min(0).max(60_000).optional(),
  /** Client redirect wait per hop, ms; default `scope.client_redirect_wait_ms`. */
  client_redirect_wait_ms: z.number().int().min(0).max(30_000).optional(),
};

/**
 * Crawl timeouts of the portal, and per URL pattern (spec 023 US4): the first `per_url` entry whose
 * `match` (a URL list entry) fits the page wins over the portal values, which win over defaults.
 */
export const Timeouts = z
  .object({
    ...TimeoutValues,
    per_url: z.array(z.object({ match: UrlEntry, ...TimeoutValues }).strict()).default([]),
  })
  .strict();
export type Timeouts = z.infer<typeof Timeouts>;

/** Where a portal hook runs in a crawl (spec 023 FR-001). */
export const HookPoint = z.enum([
  'onRunStart',
  'onBeforePageLoad',
  'onPageLoad',
  'onBeforeClickAction',
  'onRunEnd',
]);
export type HookPoint = z.infer<typeof HookPoint>;

/**
 * One hook of the portal (spec 023 FR-002): an exported function of `portals/<id>/hooks.ts` run
 * at `point`, on pages whose URL matches `match` (a URL list entry; absent = every page), within
 * `timeout_ms`. Hooks of one point run in file order.
 */
export const HookSpec = z
  .object({
    point: HookPoint,
    fn: z.string().regex(/^[A-Za-z_$][\w$]*$/, 'must be the name of an exported function'),
    match: UrlEntry.optional(),
    timeout_ms: z.number().int().min(100).max(120_000).default(10_000),
  })
  .strict();
export type HookSpec = z.infer<typeof HookSpec>;

/**
 * One fix-plugin turned on for the portal (spec 030 FR-031): `use` names it in
 * `@pathfinder/fix-plugins`, `with` is the client's data it needs (validated by the plugin when the
 * run starts), `match` and `timeout_ms` as for a hook.
 */
export const FixSpec = z
  .object({
    use: z.string().regex(/^[a-z][a-z0-9-]*$/, 'must be the id of a fix-plugin'),
    with: z.record(z.string(), z.unknown()).default({}),
    match: UrlEntry.optional(),
    timeout_ms: z.number().int().min(100).max(120_000).default(10_000),
  })
  .strict();
export type FixSpec = z.infer<typeof FixSpec>;

/**
 * A portal's own action rule (spec 002 FR-015 to FR-017): a new id with its class, or extra
 * keywords/paths (and optionally a higher class) for a built-in id. Rules can only add or raise.
 * Keywords are plain phrases and paths are globs, never regular expressions (research §7).
 */
export const ActionRuleConfig = z
  .object({
    id: Slug,
    class: SafetyClass.optional(),
    keywords: z.array(z.string().trim().min(1, 'must not be empty')).optional(),
    paths: z.array(z.string().min(1, 'must not be empty')).optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const alias = (RULE_ALIASES as Record<string, string>)[r.id];
    if (alias !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['id'],
        message: `"${r.id}" is an alias of "${alias}"; extend "${alias}" instead`,
      });
      return;
    }
    const builtin = (BUILTIN_RULE_CLASSES as Record<string, SafetyClass>)[r.id];
    if (r.class === 'read') {
      ctx.addIssue({
        code: 'custom',
        message: `rule "${r.id}": class "read" is not allowed; portal rules can only add or raise a class`,
      });
    } else if (builtin === undefined && r.class === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: `rule "${r.id}": a new rule needs a class (mutating, destructive or external-side-effect)`,
      });
    } else if (
      builtin !== undefined &&
      r.class !== undefined &&
      maxSafetyClass(r.class, builtin) !== r.class
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `rule "${r.id}": class "${r.class}" is lower than built-in "${r.id}" (${builtin})`,
      });
    }
    if (!r.keywords?.length && !r.paths?.length) {
      ctx.addIssue({ code: 'custom', message: `rule "${r.id}": needs keywords or paths` });
    }
  });
export type ActionRuleConfig = z.infer<typeof ActionRuleConfig>;

export const Budgets = z.object({
  max_depth: PositiveInt,
  max_states: PositiveInt,
  max_actions_per_state: PositiveInt,
  max_run_time_minutes: PositiveInt,
  max_steps: PositiveInt,
});

export type Budgets = z.infer<typeof Budgets>;

export const Scope = Budgets.extend({
  allowed_domains: z.array(z.string().min(1)).min(1),
  external_link_policy: z.enum(['record', 'follow']).default('record'),
  /** How long to wait for a micro-frontend mount to fill, in ms (spec 015). */
  mfe_wait_ms: z.number().int().min(0).max(60000).default(10000),
  /** How deep nested frames are observed (spec 015). */
  frame_depth: z.number().int().min(0).max(5).default(3),
  /**
   * Longest meta-refresh delay that is followed, and the wait per client-side redirect hop, in ms
   * (spec 019 FR-007): an interstitial ("Proszę czekać…") is passed, not recorded as a screen.
   */
  client_redirect_wait_ms: z.number().int().min(0).max(30000).default(5000),
})
  // Strict: a leftover `allowed_paths` (moved to `urls`, spec 023) must not be dropped silently,
  // which would widen the scan to every URL of the domains.
  .strict();
export type Scope = z.infer<typeof Scope>;

export const Obstacle = z.object({ id: Slug, selector: z.string().min(1) });

export const RateLimit = z.object({
  requests_per_second: z.number().positive(),
  max_concurrency: PositiveInt,
  user_agent: z.string().min(1),
  /**
   * Budget for the portal's static files (scripts, stylesheets, fonts, images), apart from page
   * loads and API calls (spec 030 FR-063, owner D-2 Q4): an SPA's dozens of chunk files at the
   * polite rate made a login form take ~30 s to appear (GC-08). Default 20 per second.
   */
  static_per_second: z.number().positive().optional(),
});
export type RateLimit = z.infer<typeof RateLimit>;

/**
 * How the browser reaches the portal (spec 030 R-63, field GC-03/GC-05/GC-12): a corporate forward
 * proxy (the portal admits only the proxy's address; hosts in `bypass` go direct, e.g. a CDN the
 * proxy refuses; `<-loopback>` makes even loopback addresses go through it) and, behind a TLS-inspecting
 * proxy whose CA the browser does not trust, `ignore_https_errors` (an explicit owner choice).
 * Robots.txt is fetched by the server, not the browser: a proxy-only portal sets `robots: ignore`
 * (the doctor says so).
 */
export const Network = z
  .object({
    proxy: z
      .object({
        server: z.string().regex(/^(https?|socks5):\/\/\S+$/, 'like http://proxy.corp:3128'),
        bypass: z.array(z.string().min(1)).default([]),
      })
      .strict()
      .optional(),
    ignore_https_errors: z.boolean().default(false),
  })
  .strict();
export type Network = z.infer<typeof Network>;

/** ISO date (YYYY-MM-DD) or null while a person has not yet done the check (FR-026). */
const IsoDateOrNull = z.iso.date().nullable();

export const Compliance = z.object({
  robots_checked_on: IsoDateOrNull,
  terms_reviewed_on: IsoDateOrNull,
  terms_reviewed_by: z.string().min(1).nullable(),
});
export type Compliance = z.infer<typeof Compliance>;

const TextList = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);

const hasLocator = (l: { label?: string; placeholder?: string; css?: string }) =>
  l.label !== undefined || l.placeholder !== undefined || l.css !== undefined;

const LOCATOR_MSG = 'needs at least one of label, placeholder or css';

/** A login control locator; the first match wins in the order label, placeholder, css. */
const FieldLocator = z
  .object({
    label: z.string().min(1).optional(),
    placeholder: z.string().min(1).optional(),
    css: z.string().min(1).optional(),
  })
  .strict()
  .refine(hasLocator, { message: LOCATOR_MSG });

const SubmitLocator = z
  .object({
    label: z.string().min(1).optional(),
    placeholder: z.string().min(1).optional(),
    css: z.string().min(1).optional(),
    role: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
  })
  .strict()
  .refine((l) => hasLocator(l) || (l.role !== undefined && l.name !== undefined), {
    message: 'needs at least one of label, placeholder, css, or role together with name',
  });

/** How a persona with credentials signs in to this portal (spec 009 login-tool contract). */
export const LoginSpec = z
  .object({
    url: z.string().refine((v) => v.startsWith('/') || /^https?:\/\/\S+$/.test(v), {
      message: 'must start with "/" or be an absolute http(s) URL',
    }),
    username: FieldLocator,
    password: FieldLocator,
    submit: SubmitLocator,
    success: z
      .object({ url_not_matching: z.string().min(1).optional(), text: TextList.optional() })
      .strict()
      .refine((s) => s.url_not_matching !== undefined || s.text !== undefined, {
        message: 'needs url_not_matching or text',
      }),
    failure: z.object({ text: TextList }).strict().optional(),
    expiry: z
      .object({ url_matching: z.string().min(1).optional(), text: TextList.optional() })
      .strict()
      .refine((s) => s.url_matching !== undefined || s.text !== undefined, {
        message: 'needs url_matching or text',
      })
      .optional(),
    /** Persona auth keys that supply the username and the password. */
    fields: z
      .object({ username: z.string().min(1), password: z.string().min(1) })
      .strict()
      .default({ username: 'login', password: 'password' }),
  })
  .strict();
export type LoginSpec = z.infer<typeof LoginSpec>;

export const PortalConfig = z
  .object({
    id: Slug,
    base_url: z.url(),
    environment: Environment,
    max_action_class: SafetyClass.optional(),
    compliance: Compliance.default({
      robots_checked_on: null,
      terms_reviewed_on: null,
      terms_reviewed_by: null,
    }),
    scope: Scope,
    urls: UrlLists.default({ disallowed: [] }),
    hooks: z.array(HookSpec).default([]),
    fixes: z.array(FixSpec).default([]),
    network: Network.optional(),
    timeouts: Timeouts.optional(),
    denylist: z.array(DenylistEntry).default([]),
    obstacles: z.array(Obstacle).default([]),
    rate_limit: RateLimit.optional(),
    item_view_cap: PositiveInt.optional(),
    item_route_templates: z.array(z.string().min(1)).default([]),
    /** Case-insensitive substrings of a response body that mean the portal is blocking us (FR-008). */
    block_signatures: z.array(z.string().min(1)).default([]),
    /**
     * Requests the page's own scripts make to robots-disallowed URLs (FR-009): `block` aborts them,
     * `allow_and_record` lets them through. Main-frame navigations always obey robots.
     */
    robots_page_requests: z.enum(['block', 'allow_and_record']).default('block'),
    /**
     * `ignore`: robots.txt is neither fetched nor obeyed (constitution 3.0.0, spec 011 FR-006);
     * the BA's choice for sites they work on. Default `respect` (spec 002 FR-001 to FR-009).
     */
    robots: z.enum(['respect', 'ignore']).default('respect'),
    action_rules: z.array(ActionRuleConfig).default([]),
    /**
     * Mask PII in stored text evidence (ARIA snapshots, titles, form fields, network shapes, agent
     * notes). Off by default since constitution 2.0.0 (spec 008); screenshots are never masked.
     */
    pii_scrub: z.boolean().default(false),
    /** How to sign in; required for any persona that has `ref:` credentials (spec 009). */
    login: LoginSpec.optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const seen = new Set<string>();
    p.action_rules.forEach((r, i) => {
      if (seen.has(r.id))
        ctx.addIssue({
          code: 'custom',
          path: ['action_rules', i, 'id'],
          message: `duplicate rule id "${r.id}"`,
        });
      seen.add(r.id);
    });
    p.denylist.forEach((entry, i) => {
      if (DENYLIST_RULE_IDS.includes(entry) || entry.includes(':') || seen.has(entry)) return;
      ctx.addIssue({
        code: 'custom',
        path: ['denylist', i],
        message: `${JSON.stringify(entry)} must be a rule id (rule ids: ${[...DENYLIST_RULE_IDS, ...seen].join(', ')})`,
      });
    });
  });
export type PortalConfig = z.infer<typeof PortalConfig>;
