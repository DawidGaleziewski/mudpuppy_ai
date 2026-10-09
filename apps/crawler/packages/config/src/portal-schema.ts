import { z } from 'zod';
import { SafetyClass, maxSafetyClass } from '@pathfinder/core';
import { BUILTIN_RULE_CLASSES, DENYLIST_RULE_IDS, RULE_ALIASES } from './rule-ids.js';

export const Environment = z.enum(['production', 'staging', 'sandbox']);
export type Environment = z.infer<typeof Environment>;

const Slug = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'must be a lowercase slug');
const PositiveInt = z.number().int().positive();

/**
 * Known rule id, a `path:` glob (URL path only) or a `url:` glob (path plus query string, spec 002
 * FR-010); unknown free text is rejected, never silently ignored.
 */
export const DenylistEntry = z.string().superRefine((v, ctx) => {
  // A slug may be the portal's own `action_rules` id; checked against the file in PortalConfig.
  if (DENYLIST_RULE_IDS.includes(v) || /^[a-z0-9][a-z0-9_-]*$/.test(v)) return;
  for (const prefix of ['path:', 'url:'])
    if (v.startsWith(prefix) && v.length > prefix.length) return;
  ctx.addIssue({
    code: 'custom',
    message: `${JSON.stringify(v)} must be a rule id, "path:<glob>" or "url:<glob>" (rule ids: ${DENYLIST_RULE_IDS.join(', ')})`,
  });
});

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
  allowed_paths: z.array(z.string().min(1)).min(1),
  external_link_policy: z.enum(['record', 'follow']).default('record'),
  /** How long to wait for a micro-frontend mount to fill, in ms (spec 015). */
  mfe_wait_ms: z.number().int().min(0).max(60000).default(10000),
  /** How deep nested frames are observed (spec 015). */
  frame_depth: z.number().int().min(0).max(5).default(3),
});
export type Scope = z.infer<typeof Scope>;

export const Obstacle = z.object({ id: Slug, selector: z.string().min(1) });

export const RateLimit = z.object({
  requests_per_second: z.number().positive(),
  max_concurrency: PositiveInt,
  user_agent: z.string().min(1),
});
export type RateLimit = z.infer<typeof RateLimit>;

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
        message: `${JSON.stringify(entry)} must be a rule id, "path:<glob>" or "url:<glob>" (rule ids: ${[...DENYLIST_RULE_IDS, ...seen].join(', ')})`,
      });
    });
    if (p.environment === 'production' && p.rate_limit === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['rate_limit'],
        message: 'required when environment is production (FR-006)',
      });
    }
  });
export type PortalConfig = z.infer<typeof PortalConfig>;
