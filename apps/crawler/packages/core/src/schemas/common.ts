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
