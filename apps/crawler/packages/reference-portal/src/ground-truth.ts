import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';

/**
 * Schema of the portal's ground truth (specs/004-ba-documentation/contracts/ground-truth.md). The
 * evaluator in `@pathfinder/docs` declares its own compatible input type and never imports this.
 */

const Id = z.string().regex(/^[A-Z]+\d{2}(\.\d+)?$/);
/** A legacy-obstacle catalogue id (docs/legacy-obstacles.md). */
const LO_ID = /^LO-\d{2,}$/;

export const GtScreen = z
  .object({
    id: Id,
    route_template: z.string().startsWith('/'),
    title: z.string().min(1),
    guest_visible: z.boolean(),
    /** How a guest reaches it: plain navigation, only after a data-changing submit, or never (login). */
    reached_by: z.enum(['navigation', 'mutation', 'login']),
    /** v2 (spec 009): who can see it, `guest` (default) or a `users[].id`. */
    actor: z.string().min(1).optional(),
    /** v2: `docs/legacy-obstacles.md` ids reproduced on this screen. */
    obstacles: z.array(z.string().regex(LO_ID)).optional(),
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
    type: z.enum([
      'text',
      'number',
      'date',
      'email',
      'tel',
      'password',
      'select',
      'textarea',
      'checkbox',
      'radio',
    ]),
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
    /**
     * Phrases only a statement of this rule would contain (e.g. "30 dni"). When present, a record
     * must contain one of them to match, so a record that merely quotes the anchor label (the login
     * prompt on the same page) is not taken for this rule. For a non-observable rule they must never
     * appear on a guest page (tested).
     */
    claim_markers: z.array(z.string().min(1)).min(1).optional(),
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

/** v2: a test user of the portal; never a password (the vault holds those by `refs`). */
export const GtUser = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    persona: z.string().min(1),
    refs: z.array(z.string().min(1)).min(1),
  })
  .strict();

/** v2: an old entry point that ends on a known screen (LO-21..LO-23). */
export const GtRedirect = z
  .object({
    id: Id,
    from: z.string().startsWith('/'),
    to: z.string().startsWith('/'),
    kind: z.enum(['http', 'chain', 'meta_refresh', 'js_location']),
    hops: z.array(z.enum(['http_301', 'http_302', 'meta_refresh', 'js_location'])).min(1),
  })
  .strict();

/** v2: one catalogue obstacle present in this portal and what documenting it means. */
export const GtObstacle = z
  .object({
    id: z.string().regex(LO_ID),
    screens: z.array(Id).min(1),
    /** Phrases a record must contain to count as documenting it (evaluator `obstacles`). */
    markers: z.array(z.string().min(1)).min(1),
    expected: z.enum(['handoff', 'documented', 'ignored', 'navigated']),
  })
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
    users: z.array(GtUser).optional(),
    redirects: z.array(GtRedirect).optional(),
    obstacles: z.array(GtObstacle).optional(),
  })
  .strict()
  .superRefine((gt, ctx) => {
    const screens = new Set(gt.screens.map((s) => s.id));
    const users = new Set((gt.users ?? []).map((u) => u.id));
    const obstacles = new Set((gt.obstacles ?? []).map((o) => o.id));
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    for (const s of gt.screens) {
      // v1 files have no actor: a login-wall screen is `guest_visible: false` without one.
      if (s.actor !== undefined) {
        if (s.actor !== 'guest' && !users.has(s.actor))
          issue(`screen ${s.id}: unknown actor ${s.actor}`);
        if (s.guest_visible !== (s.actor === 'guest'))
          issue(`screen ${s.id}: guest_visible must be true exactly when actor is guest`);
      }
      for (const o of s.obstacles ?? [])
        if (!obstacles.has(o)) issue(`screen ${s.id}: obstacle ${o} missing from obstacles[]`);
    }
    for (const o of gt.obstacles ?? [])
      for (const sid of o.screens)
        if (!screens.has(sid)) issue(`obstacle ${o.id}: unknown screen ${sid}`);
    if (obstacles.size !== (gt.obstacles ?? []).length) issue('duplicate obstacle id');
    const ids = new Set<string>();
    const all = [
      ...gt.screens,
      ...gt.forms,
      ...gt.forms.flatMap((f) => f.fields),
      ...gt.rules,
      ...gt.processes,
      ...gt.terms,
      ...(gt.redirects ?? []),
    ];
    for (const x of all) {
      if (ids.has(x.id)) ctx.addIssue({ code: 'custom', message: `duplicate id ${x.id}` });
      ids.add(x.id);
    }
    for (const f of gt.forms)
      if (!screens.has(f.screen))
        ctx.addIssue({ code: 'custom', message: `form ${f.id}: unknown screen ${f.screen}` });
    for (const r of gt.rules)
      if (!screens.has(r.anchor.screen))
        ctx.addIssue({
          code: 'custom',
          message: `rule ${r.id}: unknown screen ${r.anchor.screen}`,
        });
  });
export type GroundTruth = z.infer<typeof GroundTruth>;

/** Absolute path of this package's `ground-truth.yaml`. */
export const GROUND_TRUTH_PATH = fileURLToPath(new URL('../ground-truth.yaml', import.meta.url));

/** Ground truth is YAML (G-34). */
export function loadGroundTruth(path: string = GROUND_TRUTH_PATH): GroundTruth {
  return GroundTruth.parse(parse(readFileSync(path, 'utf8')));
}
