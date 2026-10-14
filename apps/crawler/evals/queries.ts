/**
 * The questions the eval asks the workspace store, one named function each. Read-only; the
 * graders turn the answers into scores.
 */
import type { openDb } from '@pathfinder/store';

export type RawDb = ReturnType<typeof openDb>['raw'];

const one = <T>(db: RawDb, sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as T;
const column = (db: RawDb, sql: string, ...p: unknown[]) =>
  (db.prepare(sql).all(...p) as { v: string }[]).map((r) => r.v);
const count = (db: RawDb, sql: string, ...p: unknown[]) => one<{ n: number }>(db, sql, ...p).n;

/** The crawl run the crawler agent started for this eval, if it started one. */
export function latestCrawlRun(db: RawDb, portal: string, persona: string, since: string) {
  return one<{ id: string; status: string } | undefined>(
    db,
    'SELECT id, status FROM runs WHERE portal_id = ? AND persona_id = ? AND started_at >= ? ORDER BY started_at DESC LIMIT 1',
    portal,
    persona,
    since,
  );
}

/** The BA's analysis sessions for this eval, oldest first: the map one, then the traces one (F-12). */
export function analysisSessions(db: RawDb, portal: string, since: string) {
  return db
    .prepare(
      'SELECT id, status FROM analysis_sessions WHERE portal_id = ? AND started_at >= ? ORDER BY started_at',
    )
    .all(portal, since) as { id: string; status: string }[];
}

/** How the crawl run ended: `completed`, or `interrupted` when a budget cut it short. */
export function runEnd(db: RawDb, runId: string) {
  return one<{ status: string; steps_used: number }>(
    db,
    'SELECT status, steps_used FROM runs WHERE id = ?',
    runId,
  );
}

export function pendingFrontierCount(db: RawDb, runId: string): number {
  return count(
    db,
    "SELECT count(*) AS n FROM frontier WHERE run_id = ? AND status = 'pending'",
    runId,
  );
}

/** How often the crawler logged a decision under `rule` (e.g. `login`, `relogin`). */
export function decisionCount(db: RawDb, runId: string, rule: string): number {
  return count(
    db,
    'SELECT count(*) AS n FROM decision_log WHERE run_id = ? AND rule = ?',
    runId,
    rule,
  );
}

/** Route templates of every state the run observed. */
export function observedRoutes(db: RawDb, runId: string): string[] {
  return column(
    db,
    'SELECT DISTINCT s.route_template AS v FROM state_observations o JOIN states s ON s.id = o.state_id WHERE o.run_id = ?',
    runId,
  );
}

/** Page compositions (frames, mounts) as JSON, to find pages read inside frames. */
export function compositions(db: RawDb, runId: string): string[] {
  return column(
    db,
    'SELECT composition_json AS v FROM state_observations WHERE run_id = ? AND composition_json IS NOT NULL',
    runId,
  );
}

/** The actions of every transition the crawler actually executed. */
export function executedActions(db: RawDb, runId: string): string[] {
  return column(
    db,
    "SELECT action_json AS v FROM edges WHERE run_id = ? AND status = 'executed'",
    runId,
  );
}

/** URL templates of the network calls an executed action caused. */
export function actionCallUrls(db: RawDb, runId: string): string[] {
  return column(
    db,
    'SELECT url_template AS v FROM network_calls WHERE run_id = ? AND edge_id IS NOT NULL',
    runId,
  );
}

/** Route templates of the trace's steps in order (the state each step ended on). */
export function traceStepRoutes(db: RawDb, runId: string): string[] {
  return column(
    db,
    `SELECT s.route_template AS v FROM process_steps ps
       JOIN processes p ON p.id = ps.process_id
       JOIN states s ON s.id = ps.state_after
      WHERE p.run_id = ? ORDER BY ps.ord`,
    runId,
  );
}

/** How the trace ended: goal_reached, boundary_reached, stopped, abandoned; null while running. */
export function traceOutcome(db: RawDb, runId: string): string | null {
  return (
    one<{ outcome: string | null } | undefined>(
      db,
      'SELECT outcome FROM processes WHERE run_id = ?',
      runId,
    )?.outcome ?? null
  );
}
