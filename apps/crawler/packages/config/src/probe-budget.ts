// How many form probes a run may try (spec 032 US2.7, owner answer O-M4, 2026-10-16): at most 12 per
// form step and 60 per run unless the portal file says otherwise. `per_run: 0` turns probing off.

import { z } from 'zod';

export const ProbeBudget = z
  .object({
    per_step: z.number().int().min(0).default(12),
    per_run: z.number().int().min(0).default(60),
  })
  .strict();
export type ProbeBudget = z.infer<typeof ProbeBudget>;

export const DEFAULT_PROBE_BUDGET: ProbeBudget = ProbeBudget.parse({});
