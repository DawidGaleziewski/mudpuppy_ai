import { z } from 'zod';
import { SafetyClass } from '@mudpuppy/core';
import { Budgets, Scope, UrlLists } from './portal-schema.js';

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

/**
 * The persona's test data: form control label (verbatim, as the portal shows it) -> synthetic
 * value, used by trace runs, map-mode autofill and form probes (named `trace_inputs` until spec 032,
 * owner 2026-10-17). The persona loader refuses any value the PII scrubber would change.
 */
export const TestData = z.record(z.string().min(1), z.string());

const AttributeValue = z.union([z.string(), z.number(), z.boolean()]);

/**
 * What decides this test user's access (spec 024 US1): tariff, contract, feature flags…, any keys.
 * MudPuppy stores and shows them and never interprets them (FR-008); `extends` merges per key.
 */
export const PersonaAttributes = z.record(
  z.string().min(1).max(100),
  z.union([AttributeValue, z.array(AttributeValue)]),
);
export type PersonaAttributes = z.infer<typeof PersonaAttributes>;

const shape = {
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'must be a lowercase slug'),
  extends: z.array(z.string().min(1)).default([]),
  auth: Auth,
  max_action_class: SafetyClass,
  // `urls` narrows the portal's URL lists: a URL must pass both (spec 023 US3.5).
  scope_restrictions: Scope.partial().extend({ urls: UrlLists.optional() }),
  budgets: Budgets.partial(),
  consent: Consent,
  viewport: Viewport,
  locale: z.string().min(1),
  test_data: TestData,
  attributes: PersonaAttributes,
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
    test_data: shape.test_data.optional(),
    attributes: shape.attributes.optional(),
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
    test_data: shape.test_data.default({}),
    attributes: shape.attributes.default({}),
  })
  .strict();
export type PersonaConfig = z.infer<typeof PersonaConfig>;
