// Differing states (spec 033 US3, research R7): where the same graph point showed different
// screens across scans, so the BA explains each outcome before documenting (design §7).
//
// - Action group `action:<screen>:<role>:<name>`: the same from-screen and action (role and
//   accessible name, the identity across scans) led to two or more screens. Edges a probe pressed
//   are left out: their outcome is explained by the probe's input (spec 032).
// - Route group `route:<route>`: one route template holds two or more screens whose states are no
//   form step and of kind `main` (form steps and validation/technical states are explained). A
//   route with a parameter (`/produkt/:param`) holds different items by design and is skipped.
// - Replay groups (`replay:`) are not built: the trace masks the state ids of `replay_diverged`
//   (spec 033 F-01).
// Groups are computed from the store on each call; nothing here writes.

import type { BaContext } from '../../context.js';

export interface OutcomeScan {
  run_id: string;
  persona: string;
  environment: string;
  started_at: string;
}

export interface GroupOutcome {
  screen_id: string;
  state_id: string;
  route: string;
  title: string;
  state_kind: string;
  scans: OutcomeScan[];
  first_seen: string;
  last_seen: string;
  http_status: number | null;
  frequency: { seen: number; of: number };
  reproduced: boolean;
}

export interface DifferingGroup {
  key: string;
  kind: 'action' | 'route';
  point: {
    screen_id?: string;
    route: string;
    title?: string;
    action?: { role: string; name: string };
  };
  outcomes: GroupOutcome[];
}

interface Hit {
  group: string;
  screen_id: string;
  state_id: string;
  run_id: string;
  at: string;
  edge_id: string | null;
}

interface ScreenRow {
  id: string;
  route_template: string;
  title: string;
}

/** Executed moves per (from screen, action) with their target screen, probes left out. */
function actionHits(
  ctx: BaContext,
  portal: string,
): (Hit & { from: string; role: string; name: string })[] {
  return ctx.raw
    .prepare(
      `SELECT f.screen_id AS "from", coalesce(json_extract(e.action_json, '$.role'), '') AS role,
              coalesce(json_extract(e.action_json, '$.accessible_name'), '') AS name,
              t.screen_id AS screen_id, e.to_state AS state_id, e.run_id, e.created_at AS at,
              e.id AS edge_id
         FROM edges e JOIN states f ON f.id = e.from_state JOIN states t ON t.id = e.to_state
        WHERE f.portal_id = ? AND e.status = 'executed'
          AND f.screen_id IS NOT NULL AND t.screen_id IS NOT NULL AND t.screen_id <> f.screen_id
          AND NOT EXISTS (SELECT 1 FROM probe_outcomes p WHERE p.edge_id = e.id)
        ORDER BY e.created_at, e.id`,
    )
    .all(portal) as (Hit & { from: string; role: string; name: string })[];
}

/** Observations of main, non-form-step states, per route. */
function routeHits(ctx: BaContext, portal: string): (Hit & { route: string })[] {
  return ctx.raw
    .prepare(
      `SELECT s.route_template AS route, s.screen_id, s.id AS state_id, o.run_id,
              o.observed_at AS at, NULL AS edge_id
         FROM state_observations o JOIN states s ON s.id = o.state_id
        WHERE s.portal_id = ? AND s.screen_id IS NOT NULL AND s.form_step_id IS NULL
          AND coalesce(s.state_kind, 'main') = 'main' AND instr(s.route_template, ':') = 0
        ORDER BY o.observed_at, s.id`,
    )
    .all(portal) as (Hit & { route: string })[];
}

function byGroup<T extends Hit>(hits: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const h of hits) out.set(h.group, [...(out.get(h.group) ?? []), h]);
  return out;
}

/** Groups whose hits reach two or more screens. */
function differing<T extends Hit>(hits: T[]): Map<string, T[]> {
  return new Map(
    [...byGroup(hits)].filter(([, hs]) => new Set(hs.map((h) => h.screen_id)).size > 1),
  );
}

function runsOf(ctx: BaContext, portal: string): Map<string, OutcomeScan> {
  const rows = ctx.raw
    .prepare(
      'SELECT id AS run_id, persona_id AS persona, environment, started_at FROM runs WHERE portal_id = ?',
    )
    .all(portal) as OutcomeScan[];
  return new Map(rows.map((r) => [r.run_id, r]));
}

function httpStatus(ctx: BaContext, edgeIds: string[]): number | null {
  if (edgeIds.length === 0) return null;
  const marks = edgeIds.map(() => '?').join(',');
  const row = ctx.raw
    .prepare(`SELECT max(status) AS status FROM network_calls WHERE edge_id IN (${marks})`)
    .get(...edgeIds) as { status: number | null } | undefined;
  return row?.status ?? null;
}

interface Lookups {
  ctx: BaContext;
  screens: Map<string, ScreenRow>;
  runs: Map<string, OutcomeScan>;
  kinds: Map<string, string>;
}

/** One outcome per screen the group's hits reached, with its evidence (R7). */
function outcomes(l: Lookups, hits: Hit[]): GroupOutcome[] {
  const runsTaking = new Set(hits.map((h) => h.run_id));
  const perScreen = new Map<string, Hit[]>();
  for (const h of hits) perScreen.set(h.screen_id, [...(perScreen.get(h.screen_id) ?? []), h]);
  return [...perScreen].map(([screenId, hs]) => {
    const runIds = [...new Set(hs.map((h) => h.run_id))];
    const firstRun = hs[0]!.run_id;
    const stateCounts = new Map<string, number>();
    for (const h of hs) stateCounts.set(h.state_id, (stateCounts.get(h.state_id) ?? 0) + 1);
    const stateId = [...stateCounts].sort((a, b) => b[1] - a[1])[0]![0];
    const screen = l.screens.get(screenId);
    return {
      screen_id: screenId,
      state_id: stateId,
      route: screen?.route_template ?? '',
      title: screen?.title ?? '',
      state_kind: l.kinds.get(stateId) ?? 'main',
      scans: runIds.map((r) => l.runs.get(r)).filter((s): s is OutcomeScan => s !== undefined),
      first_seen: hs[0]!.at,
      last_seen: hs[hs.length - 1]!.at,
      http_status: httpStatus(
        l.ctx,
        hs.map((h) => h.edge_id).filter((e): e is string => !!e),
      ),
      frequency: { seen: runIds.length, of: runsTaking.size },
      reproduced: runIds.some((r) => r !== firstRun),
    };
  });
}

function lookups(ctx: BaContext, portal: string): Lookups {
  const screens = ctx.raw
    .prepare('SELECT id, route_template, title FROM screens WHERE portal_id = ?')
    .all(portal) as ScreenRow[];
  const kinds = ctx.raw
    .prepare("SELECT id, coalesce(state_kind, 'main') AS kind FROM states WHERE portal_id = ?")
    .all(portal) as { id: string; kind: string }[];
  return {
    ctx,
    screens: new Map(screens.map((s) => [s.id, s])),
    runs: runsOf(ctx, portal),
    kinds: new Map(kinds.map((k) => [k.id, k.kind])),
  };
}

/** Every differing-states group of a portal; `route` narrows to groups that touch that route. */
export function differingStates(ctx: BaContext, portal: string, route?: string): DifferingGroup[] {
  const l = lookups(ctx, portal);
  const groups: DifferingGroup[] = [];
  const acts = actionHits(ctx, portal).map((h) => ({
    ...h,
    group: `action:${h.from}:${h.role}:${h.name}`,
  }));
  for (const [key, hs] of differing(acts)) {
    const from = l.screens.get(hs[0]!.from);
    groups.push({
      key,
      kind: 'action',
      point: {
        screen_id: hs[0]!.from,
        route: from?.route_template ?? '',
        title: from?.title ?? '',
        action: { role: hs[0]!.role, name: hs[0]!.name },
      },
      outcomes: outcomes(l, hs),
    });
  }
  const routes = routeHits(ctx, portal).map((h) => ({ ...h, group: `route:${h.route}` }));
  for (const [key, hs] of differing(routes))
    groups.push({ key, kind: 'route', point: { route: hs[0]!.route }, outcomes: outcomes(l, hs) });
  return route
    ? groups.filter((g) => g.point.route === route || g.outcomes.some((o) => o.route === route))
    : groups;
}
