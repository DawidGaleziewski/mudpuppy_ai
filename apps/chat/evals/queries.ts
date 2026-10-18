/** Read-only questions the grouping graders ask the trial's store, one function each. */
import type BetterSqlite3 from 'better-sqlite3';

type Db = BetterSqlite3.Database;

/** One grouping the assistant suggested: its screens in walking order and its reason. */
export interface Suggestion {
  name: string;
  why: string;
  steps: { route: string; state_id: string | null }[];
}

export function openSuggestions(raw: Db, portal: string): Suggestion[] {
  const rows = raw
    .prepare(
      `SELECT name, why, steps FROM grouping_suggestions
       WHERE portal_id = ? AND status = 'open' ORDER BY created_at`,
    )
    .all(portal) as { name: string; why: string; steps: string }[];
  return rows.map((r) => ({
    name: r.name,
    why: r.why,
    steps: (JSON.parse(r.steps) as { route: string; state_id: string | null }[]).map((s) => ({
      route: s.route,
      state_id: s.state_id,
    })),
  }));
}

/** Route templates the store's scans recorded for the portal. */
export function recordedRoutes(raw: Db, portal: string): Set<string> {
  const rows = raw
    .prepare('SELECT DISTINCT route_template AS r FROM states WHERE portal_id = ?')
    .all(portal) as { r: string }[];
  return new Set(rows.map((x) => x.r));
}

/** States that are not a page of the process: Chromium's error page, failed loads (spec 036). */
export function technicalStates(raw: Db, portal: string): Set<string> {
  const rows = raw
    .prepare("SELECT id FROM states WHERE portal_id = ? AND state_kind = 'technical'")
    .all(portal) as { id: string }[];
  return new Set(rows.map((x) => x.id));
}

/** The visible names of the links and buttons the scans followed (what a `why` may quote). */
export function followedNames(raw: Db, portal: string): Set<string> {
  const rows = raw
    .prepare(
      `SELECT DISTINCT json_extract(e.action_json, '$.accessible_name') AS n FROM edges e
       JOIN runs r ON r.id = e.run_id
       WHERE r.portal_id = ? AND e.status = 'executed' AND n IS NOT NULL AND length(n) > 1`,
    )
    .all(portal) as { n: string }[];
  return new Set(rows.map((x) => x.n));
}
