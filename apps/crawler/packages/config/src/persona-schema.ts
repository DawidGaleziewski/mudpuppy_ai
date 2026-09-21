import { z } from 'zod';
import { SafetyClass } from '@pathfinder/core';
import { Budgets, Scope } from './portal-schema.js';

/** Credential fields are references by name (`ref:NAME`); the values themselves never live in a file (FR-017). */
export const Auth = z.union([z.literal('none'), z.record(z.string().min(1), z.string().min(1))]);

export const Consent = z.object({
  decline_location: z.boolean().optional(),
  decline_marketing: z.boolean().optional(),
  decline_personalization: z.boolean().optional(),
});

export const Viewport = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const shape = {
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'must be a lowercase slug'),
  extends: z.array(z.string().min(1)).default([]),
  auth: Auth,
  max_action_class: SafetyClass,
  scope_restrictions: Scope.partial(),
  budgets: Budgets.partial(),
  consent: Consent,
  viewport: Viewport,
  locale: z.string().min(1),
};

/** A single persona or mixin file: everything is optional because mixins are partial. */
export const PersonaFile = z
  .object({
    id: shape.id.optional(),
    extends: shape.extends,
    auth: shape.auth.optional(),
    max_action_class: shape.max_action_class.optional(),
    scope_restrictions: shape.scope_restrictions.optional(),
    budgets: shape.budgets.optional(),
    consent: shape.consent.optional(),
    viewport: shape.viewport.optional(),
    locale: shape.locale.optional(),
  })
  .strict();
export type PersonaFile = z.infer<typeof PersonaFile>;

/** The resolved (post-`extends`) persona. Safe defaults: no auth, `read` ceiling, empty narrowing. */
export const PersonaConfig = z
  .object({
    id: shape.id,
    extends: shape.extends,
    auth: shape.auth.default('none'),
    max_action_class: shape.max_action_class.default('read'),
    scope_restrictions: shape.scope_restrictions.default({}),
    budgets: shape.budgets.default({}),
    consent: shape.consent.default({}),
    viewport: shape.viewport,
    locale: shape.locale,
  })
  .strict();
export type PersonaConfig = z.infer<typeof PersonaConfig>;
