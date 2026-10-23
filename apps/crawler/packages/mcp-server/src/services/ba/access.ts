// get_access_matrix (spec 024 US2): which personas reached each screen, the variant each saw and
// the elements only some personas see. The same model as the dashboard's `queries_access.py`;
// both are checked against `apps/crawler/tests/fixtures/access/three-personas.json`.
//
// - A persona's variant of a screen is the newest state of that screen it observed.
// - Elements are a state's actions as `role "name"` keys (the role alone when unnamed).
// - "Not seen by" counts only personas that reached the screen in a completed map run.
// - An element depends on access when some persona sees it and another does not; a screen does
//   when any element does, or when a persona with a completed map run never reached it.
// - Explained (spec 024 P2, plan E): `explained_by` / `reach_explained_by` name the records whose
//   latest revision cites both sides of the difference (contracts/get-access-matrix.md).

import { z } from 'zod';
import type { BaContext } from '../../context.js';
import { parseInput } from '../../errors.js';
import { json } from './common.js';

export const GetAccessMatrixInput = z
  .object({ portal_id: z.string().min(1), screen_id: z.string().min(1).optional() })
  .strict();

interface ScreenSighting {
  screen_id: string;
  route_template: string;
  title: string;
  persona_id: string;
  state_id: string;
  run_id: string;
  observed_at: string;
  complete: number;
}

interface Variant {
  persona_id: string;
  state_id: string;
  run_id: string;
  observed_at: string;
  complete_map_run: boolean;
}

interface ScreenAccess {
  screen_id: string;
  route: string;
  title: string;
  depends_on_access: boolean;
  variants: Variant[];
  not_reached: string[];
  reach_explained_by: string[];
  elements_total: number;
  elements: { key: string; seen_by: string[]; not_seen_by: string[]; explained_by: string[] }[];
}

/** What one record's latest revision cites: states, and `state|element key` regions. */
interface Cited {
  kind: string;
  states: Set<string>;
  regions: Set<string>;
}

interface Evidence {
  cited: Map<string, Cited>;
  /** persona → the states it observed */
  observed: Map<string, Set<string>>;
}

const elementKey = (role: string, name: string | null): string =>
  name ? `${role} "${name}"` : role;

/** Code-point order, as Python's `sorted` (not `localeCompare`): both sides list in one order. */
const byText = (a: string, b: string): number => Number(a > b) - Number(a < b);

/** ScreenSightings of one screen, oldest first: the newest per persona, flagged when any was complete. */
function variantsOf(rows: ScreenSighting[]): Variant[] {
  const newest = new Map<string, ScreenSighting>();
  const complete = new Set<string>();
  for (const r of rows) {
    newest.set(r.persona_id, r);
    if (r.complete) complete.add(r.persona_id);
  }
  return [...newest.entries()]
    .sort(([a], [b]) => byText(a, b))
    .map(([persona_id, r]) => ({
      persona_id,
      state_id: r.state_id,
      run_id: r.run_id,
      observed_at: r.observed_at,
      complete_map_run: complete.has(persona_id),
    }));
}

/** A region key without its `#n` suffix (the second `button "Export"` is `…"Export"#2`). */
const regionBase = (region: string): string => region.replace(/#\d+$/, '');

/** Citations of the portal's rules and open questions (latest revisions, not withdrawn). */
function evidenceOf(ctx: BaContext, portalId: string): Evidence {
  const links = ctx.raw
    .prepare(
      `SELECT r.key, r.kind, l.target_id, l.region FROM doc_records r
       JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev
       JOIN doc_evidence l ON l.revision_id = v.id
        AND l.target_kind IN ('state', 'screen_region')
       WHERE r.portal_id = ? AND r.withdrawn = 0
         AND r.kind IN ('business_rule', 'open_question')`,
    )
    .all(portalId) as { key: string; kind: string; target_id: string; region: string | null }[];
  const cited = new Map<string, Cited>();
  for (const x of links) {
    const c = cited.get(x.key) ?? { kind: x.kind, states: new Set(), regions: new Set() };
    c.states.add(x.target_id);
    if (x.region) c.regions.add(`${x.target_id}|${regionBase(x.region)}`);
    cited.set(x.key, c);
  }
  const observed = new Map<string, Set<string>>();
  const seen = ctx.raw
    .prepare(
      `SELECT DISTINCT o.persona_id, o.state_id FROM state_observations o
       JOIN states s ON s.id = o.state_id WHERE s.portal_id = ?`,
    )
    .all(portalId) as { persona_id: string; state_id: string }[];
  for (const o of seen)
    observed.set(o.persona_id, (observed.get(o.persona_id) ?? new Set()).add(o.state_id));
  return { cited, observed };
}

const meets = (a: Set<string>, b: Set<string>): boolean => [...a].some((x) => b.has(x));

/** Rules citing the element's region on a seer's variant and a non-seer's variant (plan P2 E). */
function explainingElement(
  ev: Evidence,
  key: string,
  seers: Set<string>,
  others: Set<string>,
): string[] {
  return [...ev.cited.entries()]
    .filter(
      ([, c]) =>
        c.kind === 'business_rule' &&
        [...seers].some((s) => c.regions.has(`${s}|${key}`)) &&
        meets(c.states, others),
    )
    .map(([k]) => k)
    .sort(byText);
}

/** Rules or questions citing the screen and a state an unreaching persona observed. */
function explainingReach(ev: Evidence, screenStates: Set<string>, notReached: string[]): string[] {
  if (notReached.length === 0) return [];
  const elsewhere = new Set(notReached.flatMap((p) => [...(ev.observed.get(p) ?? [])]));
  return [...ev.cited.entries()]
    .filter(([, c]) => meets(c.states, screenStates) && meets(c.states, elsewhere))
    .map(([k]) => k)
    .sort(byText);
}

function screenAccess(
  rows: ScreenSighting[],
  keys: Map<string, Set<string>>,
  completePersonas: Set<string>,
  ev: Evidence,
): ScreenAccess {
  const variants = variantsOf(rows);
  const stateOf = new Map(variants.map((v) => [v.persona_id, v.state_id]));
  const seen = new Map(
    variants.map((v) => [v.persona_id, keys.get(v.state_id) ?? new Set<string>()]),
  );
  const counted = variants.filter((v) => v.complete_map_run).map((v) => v.persona_id);
  const everyKey = [...new Set([...seen.values()].flatMap((s) => [...s]))].sort(byText);
  const statesOf = (personas: string[]) => new Set(personas.map((p) => stateOf.get(p)!));
  const elements = everyKey
    .map((key) => ({
      key,
      seen_by: [...seen.keys()].filter((p) => seen.get(p)!.has(key)),
      not_seen_by: counted.filter((p) => !seen.get(p)!.has(key)),
    }))
    .filter((e) => e.seen_by.length > 0 && e.not_seen_by.length > 0)
    .map((e) => ({
      ...e,
      explained_by: explainingElement(ev, e.key, statesOf(e.seen_by), statesOf(e.not_seen_by)),
    }));
  const notReached = [...completePersonas].filter((p) => !seen.has(p)).sort(byText);
  const first = rows[0]!;
  return {
    screen_id: first.screen_id,
    route: first.route_template,
    title: first.title,
    depends_on_access: elements.length > 0 || notReached.length > 0,
    variants,
    not_reached: notReached,
    reach_explained_by: explainingReach(ev, new Set(rows.map((r) => r.state_id)), notReached),
    elements_total: everyKey.length,
    elements,
  };
}

/** Each persona's attributes as its newest run of the portal recorded them (spec 024 US1.1). */
function personaAttributes(ctx: BaContext, portalId: string): Record<string, unknown> {
  const rows = ctx.raw
    .prepare(
      `SELECT persona_id, config_snapshot FROM runs WHERE portal_id = ?
       ORDER BY persona_id, started_at, id`,
    )
    .all(portalId) as { persona_id: string; config_snapshot: string }[];
  const out: Record<string, unknown> = {};
  for (const r of rows)
    out[r.persona_id] =
      json<{ persona?: { attributes?: unknown } }>(r.config_snapshot).persona?.attributes ?? {};
  return out;
}

/**
 * A full scan (spec 024 edge cases, R-33 F-03): a completed map run that stopped before its step
 * budget. Only full scans count as evidence that a persona does not get somewhere or see something.
 */
const fullScan = (t: string) =>
  `(${t}.status = 'completed' AND ${t}.mode = 'map' AND ${t}.steps_used <
     coalesce(json_extract(${t}.config_snapshot, '$.portal.scope.max_steps'), 1e9))`;

/** The portal's access matrix, or one screen's row of it, with each persona's attributes. */
export function getAccessMatrix(ctx: BaContext, raw: unknown) {
  const input = parseInput(GetAccessMatrixInput, raw);
  const runs = ctx.raw
    .prepare(
      `SELECT persona_id, MAX(${fullScan('runs')}) AS complete,
              MAX(status = 'completed' AND mode = 'map') AS mapped
       FROM runs WHERE portal_id = ? GROUP BY persona_id ORDER BY persona_id`,
    )
    .all(input.portal_id) as { persona_id: string; complete: number; mapped: number }[];
  const completePersonas = new Set(runs.filter((r) => r.complete).map((r) => r.persona_id));
  const observations = ctx.raw
    .prepare(
      `SELECT sc.id AS screen_id, sc.route_template, sc.title, o.persona_id, o.state_id,
              o.run_id, o.observed_at, ${fullScan('r')} AS complete
       FROM state_observations o
       JOIN states s ON s.id = o.state_id
       JOIN screens sc ON sc.id = s.screen_id
       JOIN runs r ON r.id = o.run_id
       WHERE sc.portal_id = ? AND (? IS NULL OR sc.id = ?)
       ORDER BY sc.route_template, sc.title, sc.id, o.observed_at, o.run_id`,
    )
    .all(input.portal_id, input.screen_id ?? null, input.screen_id ?? null) as ScreenSighting[];
  // Only the actions of the screens asked for (one screen when screen_id is given).
  const keys = new Map<string, Set<string>>();
  const actions = ctx.raw
    .prepare(
      `SELECT DISTINCT a.state_id, a.role, a.accessible_name FROM actions a
       JOIN states s ON s.id = a.state_id
       WHERE s.portal_id = ? AND s.screen_id IS NOT NULL AND (? IS NULL OR s.screen_id = ?)`,
    )
    .all(input.portal_id, input.screen_id ?? null, input.screen_id ?? null) as {
    state_id: string;
    role: string;
    accessible_name: string | null;
  }[];
  for (const a of actions) {
    const set = keys.get(a.state_id) ?? new Set<string>();
    set.add(elementKey(a.role, a.accessible_name));
    keys.set(a.state_id, set);
  }
  const evidence = evidenceOf(ctx, input.portal_id);
  const byScreen = new Map<string, ScreenSighting[]>();
  for (const o of observations) {
    const rows = byScreen.get(o.screen_id) ?? [];
    rows.push(o);
    byScreen.set(o.screen_id, rows);
  }
  return {
    portal_id: input.portal_id,
    personas: runs.map((r) => r.persona_id),
    // R-33 F-03 (spec 046): mapped only by runs that ran out of steps; never "not reached".
    budget_limited: runs.filter((r) => r.mapped && !r.complete).map((r) => r.persona_id),
    persona_attributes: personaAttributes(ctx, input.portal_id),
    screens: [...byScreen.values()].map((rows) =>
      screenAccess(rows, keys, completePersonas, evidence),
    ),
  };
}
