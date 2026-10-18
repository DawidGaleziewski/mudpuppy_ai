import { z } from 'zod';

export const SafetyClass = z.enum(['read', 'mutating', 'destructive', 'external-side-effect']);
export type SafetyClass = z.infer<typeof SafetyClass>;

export const Confidence = z.enum(['observed', 'inferred', 'needs_confirmation']);
export type Confidence = z.infer<typeof Confidence>;

export const RunStatus = z.enum(['running', 'completed', 'stopped_warning', 'interrupted']);
export type RunStatus = z.infer<typeof RunStatus>;

export const FrontierStatus = z.enum([
  'skipped_unsafe',
  'out_of_scope',
  'denylisted',
  'robots_disallowed',
  'budget_reached',
  'unreachable',
]);
export type FrontierStatus = z.infer<typeof FrontierStatus>;

export const EdgeStatus = z.enum(['executed', 'skipped']);
export type EdgeStatus = z.infer<typeof EdgeStatus>;

export const Stabilization = z.enum(['settled', 'never_stabilized']);
export type Stabilization = z.infer<typeof Stabilization>;

/** What a visit or a transition came to (spec 039 design § 5.6; migration 0029). */
export const StepResult = z.enum([
  'ok',
  'validation',
  'business_error',
  'technical_error',
  'timeout',
  'blocked',
]);
export type StepResult = z.infer<typeof StepResult>;

/** The kind of a transition (spec 039 design § 5.7). */
export const TransitionKind = z.enum([
  'click',
  'fill',
  'select',
  'check',
  'submit',
  'navigate',
  'back',
]);
export type TransitionKind = z.infer<typeof TransitionKind>;

/** Who drove a transition: the crawler agent or the headless driver (spec 039 design § 9). */
export const Driver = z.enum(['agent', 'headless']);
export type Driver = z.infer<typeof Driver>;

const DANGER_ORDER: readonly SafetyClass[] = SafetyClass.options;

/** Danger ordering read < mutating < destructive < external-side-effect; returns the less dangerous. */
export function minSafetyClass(a: SafetyClass, b: SafetyClass): SafetyClass {
  return DANGER_ORDER.indexOf(a) <= DANGER_ORDER.indexOf(b) ? a : b;
}

/** Returns the more dangerous class (used when combining classifier signals). */
export function maxSafetyClass(a: SafetyClass, b: SafetyClass): SafetyClass {
  return DANGER_ORDER.indexOf(a) >= DANGER_ORDER.indexOf(b) ? a : b;
}

export const Id = z.string().min(1);
/** UTC ISO 8601 with milliseconds and `Z`. */
export const Timestamp = z.iso.datetime({ precision: 3 });
/** `<sha256>.<ext>` under data/evidence/. Required and non-empty (Principle II). */
export const EvidenceRef = z.string().min(1);
export const JsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValue),
    z.record(z.string(), JsonValue),
  ]),
);
