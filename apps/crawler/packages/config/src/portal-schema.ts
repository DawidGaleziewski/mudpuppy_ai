import { z } from 'zod';
import { SafetyClass } from '@pathfinder/core';

/** Built-in denylist rule ids; each carries keyword and PL/EN path patterns in `safety`. */
export const DENYLIST_RULE_IDS = [
  'logout',
  'delete',
  'payment',
  'bidding',
  'buy_now',
  'message_or_contact_seller',
  'reveal_seller_contact',
] as const;
export type DenylistRuleId = (typeof DENYLIST_RULE_IDS)[number];

export const Environment = z.enum(['production', 'staging', 'sandbox']);
export type Environment = z.infer<typeof Environment>;

const Slug = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'must be a lowercase slug');
const PositiveInt = z.number().int().positive();

/** Known rule id or a `path:` glob; unknown free text is rejected, never silently ignored. */
export const DenylistEntry = z
  .string()
  .refine(
    (v) =>
      (DENYLIST_RULE_IDS as readonly string[]).includes(v) ||
      (v.startsWith('path:') && v.length > 'path:'.length),
    { message: `must be one of ${DENYLIST_RULE_IDS.join(', ')} or a "path:<glob>" entry` },
  );

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
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.environment === 'production' && p.rate_limit === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['rate_limit'],
        message: 'required when environment is production (FR-006)',
      });
    }
  });
export type PortalConfig = z.infer<typeof PortalConfig>;
