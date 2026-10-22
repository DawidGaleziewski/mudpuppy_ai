/**
 * The ground truth a documentation evaluation scores against (contracts/ground-truth.md, v2 in
 * spec 009 contracts/ground-truth-v2.md). Declared here, generically, so the evaluator never imports
 * a test portal; fields it does not score are accepted and ignored.
 */
import { z } from 'zod';

const Id = z.string().min(1);

/** A variant of a process step: on `step`, the field `field` appears when `when` is chosen. */
export const GtVariant = z.object({
  step: z.string().min(1),
  field: z.string().min(1),
  when: z.string().min(1),
});
export type GtVariant = z.infer<typeof GtVariant>;

/** The action that moves a process step on, and the step it leads to (spec 034 phase 9). */
export const GtAction = z.object({
  step: z.string().min(1),
  name: z.string().min(1),
  leads_to: z.string().min(1),
});
export type GtAction = z.infer<typeof GtAction>;

/** A call a process step makes to the portal's back end. */
export const GtApi = z.object({
  step: z.string().min(1),
  method: z.string().min(1),
  path: z.string().min(1),
});
export type GtApi = z.infer<typeof GtApi>;
const Value = z.union([z.number(), z.string()]);

export const GroundTruth = z.object({
  portal_id: z.string().min(1),
  screens: z.array(
    z.object({
      id: Id,
      route_template: z.string().min(1),
      guest_visible: z.boolean(),
      /** v2 (spec 009): `guest` or a test user id; a non-guest screen scores in `logged_in_screens`. */
      actor: z.string().optional(),
    }),
  ),
  forms: z.array(
    z.object({
      id: Id,
      screen: Id,
      fields: z.array(
        z.object({
          id: Id,
          label: z.string().min(1),
          /** Not scored here; the export quality grader (spec 034 phase 9) uses it. */
          type: z.string().optional(),
          /** What the form says to wrong input in the field, verbatim. Export quality grader. */
          messages: z.array(z.string().min(1)).optional(),
          constraints: z
            .object({
              required: z.boolean().optional(),
              min: Value.optional(),
              max: Value.optional(),
              pattern: z.string().optional(),
              max_length: z.number().optional(),
              allowed_values: z.array(z.string()).optional(),
            })
            .default({}),
        }),
      ),
    }),
  ),
  rules: z.array(
    z.object({
      id: Id,
      /** Not scored here; the text a model-based grader judges a record against (spec 017). */
      statement: z.string().min(1).optional(),
      anchor: z.object({ screen: Id, label: z.string().min(1) }),
      guest_observable: z.boolean(),
      /** When present, a matching record must also contain one of these phrases. */
      claim_markers: z.array(z.string().min(1)).optional(),
      /** Spec 045 (F-13@004): every group must be met too, each by one of its spellings. */
      claim_markers_all: z.array(z.array(z.string().min(1)).min(1)).optional(),
    }),
  ),
  processes: z.array(
    z.object({
      id: Id,
      first_route: z.string().min(1),
      last_observable_route: z.string().min(1),
      ends_with: z.enum(['mutation', 'result', 'login_wall']),
      /** The routes in order; not scored here, kept for the eval's trace grader (R-46). */
      steps: z.array(z.string().min(1)).optional(),
      /**
       * Steps whose form differs by an earlier choice (spec 034, owner review 2026-10-17): one
       * step with variants, not two steps. Not scored here; the eval's `process_models` grader.
       */
      variants: z.array(GtVariant).optional(),
      /** Not scored here; the export quality grader (spec 034 phase 9). */
      actions: z.array(GtAction).optional(),
      apis: z.array(GtApi).optional(),
    }),
  ),
  terms: z.array(
    z.object({
      id: Id,
      term: z.string().min(1),
      /** Not scored here; what the glossary judge compares a definition with (spec 017). */
      meaning: z.string().min(1).optional(),
    }),
  ),
  // v2 (spec 009 contracts/ground-truth-v2.md); absent in v1 files, which then score as before.
  redirects: z
    .array(z.object({ id: Id, from: z.string().min(1), to: z.string().min(1) }))
    .optional(),
  obstacles: z
    .array(
      z.object({
        id: Id,
        screens: z.array(Id),
        markers: z.array(z.string().min(1)),
        expected: z.enum(['handoff', 'documented', 'ignored', 'navigated']),
      }),
    )
    .optional(),
  /** Calls every page makes that belong to no process; an export must leave them out. */
  noise: z.array(z.object({ path: z.string().min(1), kind: z.string().min(1) })).optional(),
});
export type GroundTruth = z.infer<typeof GroundTruth>;
