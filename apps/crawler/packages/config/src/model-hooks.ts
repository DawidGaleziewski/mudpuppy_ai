import { z } from 'zod';

/**
 * Portal hooks of the MudPuppy 2.0 model (spec 039 design § 5.10), `model:` in `portal.yaml`. All
 * optional: without them builds come from hashed asset names, no experiment arm is read and only
 * the browser's own signals make a page a business error.
 */
export const BuildMarker = z
  .object({
    /** Response header of the page's document naming the build (`x-app-version`). */
    header: z.string().min(1).optional(),
    /** `<meta name="…">` whose content names the build (`app-version`). */
    meta: z.string().min(1).optional(),
  })
  .strict()
  .refine((m) => m.header !== undefined || m.meta !== undefined, {
    message: 'build_marker needs a header or a meta name',
  });
export type BuildMarker = z.infer<typeof BuildMarker>;

/** A cookie or storage key whose value names the A/B arm a session is in. */
export const ExperimentFlag = z.union([
  z.object({ cookie: z.string().min(1) }).strict(),
  z.object({ storage: z.string().min(1) }).strict(),
]);
export type ExperimentFlag = z.infer<typeof ExperimentFlag>;

export const ModelHooks = z
  .object({
    build_marker: BuildMarker.optional(),
    experiment_flags: z.array(ExperimentFlag).default([]),
    /** Texts that make a page a business error (a refusal to insure), matched case-insensitively. */
    business_errors: z.array(z.object({ text: z.string().min(1) }).strict()).default([]),
    /** Share of screens an action's container must be on to count as global navigation. */
    global_nav_share: z.number().gt(0).max(1).default(0.6),
    /** Deterministic replays per run (R1, R4, R5; design § 9). */
    replay_budget: z.number().int().nonnegative().default(20),
  })
  .strict();
export type ModelHooks = z.infer<typeof ModelHooks>;
