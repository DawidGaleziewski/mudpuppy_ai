/**
 * The planner's marks (spec 039 design § 14.1, T054, T075; spec 040 T033): what the model does
 * not know yet, read from the store, ordered by `plan` (priority, then better-documented screens)
 * and written as `marks` with origin `planner`, kind `recheck` and the priority. Probe and
 * exploration runs use them; people's marks (origin `person`) stay apart, and every reader of a
 * person's marks filters on origin. The open planner marks are written anew each time: they are
 * derived, never edited.
 */
import { newId, nowIso } from '@mudpuppy/core';
import { plan, type PlanItem, type PlannerInput } from '@mudpuppy/model';
import type BetterSqlite3 from 'better-sqlite3';
import { unexploredProcesses } from './process-exploration.js';
import { loadObservationTables } from './rule-mining.js';

type Raw = BetterSqlite3.Database;

/** Design § 14.1 priority 5: fewer rows than this for some outcome of a decision point. */
const THIN_ROWS = 5;

/** Doc records citing a current member state of each screen (model screen id → count). */
function anchoredDocs(raw: Raw, portal: string): Map<string, number> {
  const rows = raw
    .prepare(
      `SELECT m.screen_id, count(DISTINCT v.record_id) AS n FROM screen_members m
       JOIN model_screens s ON s.id = m.screen_id AND s.portal_id = ?
       JOIN doc_evidence e ON e.target_kind = 'state' AND e.target_id = m.state_id
       JOIN doc_revisions v ON v.id = e.revision_id
       WHERE m.to_model_version IS NULL GROUP BY m.screen_id`,
    )
    .all(portal) as { screen_id: string; n: number }[];
  return new Map(rows.map((r) => [r.screen_id, r.n]));
}

/** Where a mark points: a screen's first current page version, or a recorded transition. */
type Target = { state_id: string } | { transition_id: string };

interface Work {
  input: PlannerInput;
  targets: Map<string, { target: Target; hypothesis: string | null }>;
}

function firstState(raw: Raw, screenId: string | null): string | null {
  if (!screenId) return null;
  const row = raw
    .prepare(
      'SELECT state_id FROM screen_members WHERE screen_id = ? AND to_model_version IS NULL ORDER BY ordinal LIMIT 1',
    )
    .get(screenId) as { state_id: string } | undefined;
  return row?.state_id ?? null;
}

function screenIdOf(raw: Raw, portal: string, key: string | null): string | null {
  if (!key) return null;
  const row = raw
    .prepare('SELECT id FROM model_screens WHERE portal_id = ? AND key = ?')
    .get(portal, key) as { id: string } | undefined;
  return row?.id ?? null;
}

/** The planner's input from the store, with each subject's target. */
export function plannerWork(raw: Raw, portal: string): Work {
  const docs = anchoredDocs(raw, portal);
  const targets: Work['targets'] = new Map();
  const add = (subject: string, screenId: string | null, hypothesis: string | null = null) => {
    const state = firstState(raw, screenId);
    if (state) targets.set(subject, { target: { state_id: state }, hypothesis });
    return { anchoredDocs: (screenId && docs.get(screenId)) || 0 };
  };
  const replays = (
    raw
      .prepare(
        "SELECT id, screen_id FROM deviations WHERE portal_id = ? AND status = 'waiting_test' ORDER BY created_at, id",
      )
      .all(portal) as { id: string; screen_id: string | null }[]
  ).map((d) => ({ deviation: d.id, ...add(d.id, d.screen_id) }));
  const testing = (
    raw
      .prepare(
        `SELECT DISTINCT h.id, h.key, coalesce(d.screen_id, json_extract(h.claim_json, '$.decisionPoint.screen')) AS screen
         FROM hypotheses h JOIN hypothesis_tests t ON t.hypothesis_id = h.id AND t.verdict IS NULL
         LEFT JOIN deviations d ON d.id = h.deviation_id WHERE h.portal_id = ? ORDER BY h.key`,
      )
      .all(portal) as { id: string; key: string; screen: string | null }[]
  ).map((h) => {
    const screenId = screenIdOf(raw, portal, h.screen) ?? h.screen;
    return { hypothesis: h.key, ...add(h.key, screenId, h.id) };
  });
  const untested = (
    raw
      .prepare(
        `SELECT t.id, t.from_screen_id, t.first_seen_transition_id FROM model_transitions t
         JOIN model_screens s ON s.id = t.from_screen_id WHERE s.portal_id = ? AND t.status = 'untested'
         ORDER BY t.id`,
      )
      .all(portal) as { id: string; from_screen_id: string; first_seen_transition_id: string }[]
  ).map((t) => {
    targets.set(t.id, { target: { transition_id: t.first_seen_transition_id }, hypothesis: null });
    return { transition: t.id, anchoredDocs: docs.get(t.from_screen_id) ?? 0 };
  });
  const thinDecisionPoints = loadObservationTables(raw, portal)
    .filter((table) => {
      const per = new Map<string, number>();
      for (const r of table.rows) per.set(String(r.target), (per.get(String(r.target)) ?? 0) + 1);
      return [...per.values()].some((n) => n < THIN_ROWS);
    })
    .map((table) => {
      const point = `${table.decision_point.screen} ${table.decision_point.action}`;
      return { point, ...add(point, screenIdOf(raw, portal, table.decision_point.screen)) };
    });
  const unexplored = unexploredProcesses(raw, portal).map((key) => {
    const p = raw
      .prepare('SELECT start_screen_id FROM ba_processes WHERE portal_id = ? AND key = ?')
      .get(portal, key) as { start_screen_id: string | null } | undefined;
    return { process: key, ...add(key, p?.start_screen_id ?? null) };
  });
  return {
    input: { rulesOnNewEpoch: [], replays, testing, untested, thinDecisionPoints, unexplored },
    targets,
  };
}

/**
 * Write the plan as the portal's open planner marks (the earlier open ones are replaced); a
 * subject without a target (a screen with no page version left) is planned but not marked. One
 * open mark per target (`ux_marks_open`): the first in plan order, the highest priority, wins.
 */
export function writePlannerMarks(
  raw: Raw,
  portal: string,
  opts: { now?: string; budget?: number } = {},
): PlanItem[] {
  const work = plannerWork(raw, portal);
  const items = plan(work.input, opts.budget);
  const now = opts.now ?? nowIso();
  const insert = raw.prepare(
    `INSERT INTO marks (id, portal_id, kind, state_id, transition_id, created_by, created_at, origin,
       hypothesis_id, priority) VALUES (?, ?, 'recheck', ?, ?, 'planner', ?, 'planner', ?, ?)`,
  );
  raw.transaction(() => {
    raw
      .prepare(
        "DELETE FROM marks WHERE portal_id = ? AND origin = 'planner' AND used_by_run_id IS NULL",
      )
      .run(portal);
    const marked = new Set<string>();
    for (const it of items) {
      const t = work.targets.get(it.subject);
      if (!t) continue;
      const state = 'state_id' in t.target ? t.target.state_id : null;
      const transition = 'transition_id' in t.target ? t.target.transition_id : null;
      const target = state ?? transition!;
      if (marked.has(target)) continue;
      marked.add(target);
      insert.run(newId(), portal, state, transition, now, t.hypothesis, it.priority);
    }
  })();
  return items;
}

/** A probe run served the hypothesis: its open planner marks are used by that run. */
export function usePlannerMarks(
  raw: Raw,
  portal: string,
  hypothesisKey: string,
  runId: string,
  now = nowIso(),
): number {
  return raw
    .prepare(
      `UPDATE marks SET used_by_run_id = ?, used_at = ? WHERE portal_id = ? AND origin = 'planner'
         AND used_by_run_id IS NULL AND hypothesis_id =
           (SELECT id FROM hypotheses WHERE portal_id = ? AND key = ?)`,
    )
    .run(runId, now, portal, portal, hypothesisKey).changes;
}
