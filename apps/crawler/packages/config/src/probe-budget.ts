// How many form probes a run may try (spec 032 US2.7, owner answer O-M4, 2026-10-16): at most 24 per
// form step (raised from 12 by the owner 2026-10-18, spec 036 FR-008: 12 shared round-robin by ten
// probe kinds left one boundary try per step) and 120 per run (raised from 60 the same day, so a
// form-probing scan of a few marked steps gets the full 24 each) unless the portal file says otherwise.
// `per_run: 0` turns probing off.

import { z } from 'zod';

export const ProbeBudget = z
  .object({
    per_step: z.number().int().min(0).default(24),
    per_run: z.number().int().min(0).default(120),
  })
  .strict();
export type ProbeBudget = z.infer<typeof ProbeBudget>;

export const DEFAULT_PROBE_BUDGET: ProbeBudget = ProbeBudget.parse({});
