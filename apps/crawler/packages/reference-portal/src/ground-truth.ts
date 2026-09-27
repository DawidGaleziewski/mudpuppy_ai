import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Schema of the portal's ground truth (specs/004-ba-documentation/contracts/ground-truth.md). The
 * evaluator in `@pathfinder/docs` declares its own compatible input type and never imports this.
 */

const Id = z.string().regex(/^[A-Z]+\d{2}(\.\d+)?$/);

export const GtScreen = z
  .object({
    id: Id,
    route_template: z.string().startsWith('/'),
    title: z.string().min(1),
    guest_visible: z.boolean(),
    /** How a guest reaches it: plain navigation, only after a data-changing submit, or never (login). */
    reached_by: z.enum(['navigation', 'mutation', 'login']),
  })
  .strict();

export const GtConstraints = z
  .object({
    required: z.boolean().optional(),
    min: z.union([z.number(), z.string()]).optional(),
    max: z.union([z.number(), z.string()]).optional(),
    pattern: z.string().optional(),
    max_length: z.number().int().positive().optional(),
    allowed_values: z.array(z.string()).optional(),
  })
  .strict();

export const GtField = z
  .object({
    id: Id,
    label: z.string().min(1),
    type: z.enum(['text', 'number', 'date', 'email', 'tel', 'password', 'select', 'textarea', 'checkbox', 'radio']),
    constraints: GtConstraints,
  })
  .strict();

export const GtForm = z
  .object({
    id: Id,
    screen: Id,
    label: z.string().min(1),
    method: z.enum(['get', 'post']),
    fields: z.array(GtField).min(1),
  })
  .strict();

export const GtRule = z
  .object({
    id: Id,
    statement: z.string().min(1),
    type: z.enum(['validation', 'format', 'range', 'computation', 'eligibility', 'ui_enablement']),
    anchor: z.object({ screen: Id, label: z.string().min(1) }).strict(),
    guest_observable: z.boolean(),
  })
  .strict();

export const GtProcess = z
  .object({
    id: Id,
    name: z.string().min(1),
    steps: z.array(z.string().startsWith('/')).min(1),
    first_route: z.string().startsWith('/'),
    last_observable_route: z.string().startsWith('/'),
    ends_with: z.enum(['mutation', 'result', 'login_wall']),
  })
  .strict();

export const GtTerm = z
  .object({ id: Id, term: z.string().min(1), lang: z.string().min(2) })
  .strict();

export const GroundTruth = z
  .object({
    portal_id: z.string().min(1),
    today: z.iso.date(),
    screens: z.array(GtScreen).min(1),
    forms: z.array(GtForm),
    rules: z.array(GtRule),
    processes: z.array(GtProcess),
    terms: z.array(GtTerm),
  })
  .strict()
  .superRefine((gt, ctx) => {
    const screens = new Set(gt.screens.map((s) => s.id));
    const ids = new Set<string>();
    const all = [
      ...gt.screens,
      ...gt.forms,
      ...gt.forms.flatMap((f) => f.fields),
      ...gt.rules,
      ...gt.processes,
      ...gt.terms,
    ];
    for (const x of all) {
      if (ids.has(x.id)) ctx.addIssue({ code: 'custom', message: `duplicate id ${x.id}` });
      ids.add(x.id);
    }
    for (const f of gt.forms)
      if (!screens.has(f.screen)) ctx.addIssue({ code: 'custom', message: `form ${f.id}: unknown screen ${f.screen}` });
    for (const r of gt.rules)
      if (!screens.has(r.anchor.screen))
        ctx.addIssue({ code: 'custom', message: `rule ${r.id}: unknown screen ${r.anchor.screen}` });
  });
export type GroundTruth = z.infer<typeof GroundTruth>;

/** Absolute path of this package's `ground-truth.json`. */
export const GROUND_TRUTH_PATH = fileURLToPath(new URL('../ground-truth.json', import.meta.url));

export function loadGroundTruth(path: string = GROUND_TRUTH_PATH): GroundTruth {
  return GroundTruth.parse(JSON.parse(readFileSync(path, 'utf8')));
}
