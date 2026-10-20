/**
 * Process instances in the store (spec 039 design § 13.1, T073): each reconcile finds, for every
 * process of the portal, the journeys that entered it through a trigger and how they ended, and
 * writes them for that model version. Trace variants are computed on read from the same walk.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { newId } from '@pathfinder/core';
import {
  processInstances,
  traceVariants,
  type JourneyStep,
  type ProcessInstance,
  type ProcessShape,
} from '@pathfinder/model';

type Raw = BetterSqlite3.Database;

/** The current model screen of each state of the portal. */
export function screenOfState(raw: Raw, portal: string): Map<string, string> {
  const rows = raw
    .prepare(
      `SELECT m.state_id, m.screen_id FROM screen_members m
       JOIN model_screens s ON s.id = m.screen_id
       WHERE s.portal_id = ? AND m.to_model_version IS NULL`,
    )
    .all(portal) as { state_id: string; screen_id: string }[];
  return new Map(rows.map((r) => [r.state_id, r.screen_id]));
}

/** The shape of each listed process: A's screens, its start screen and where it completes. */
export function processShapes(
  raw: Raw,
  portal: string,
  screenOf: ReadonlyMap<string, string>,
): ProcessShape[] {
  const rows = raw
    .prepare(
      `SELECT p.id, p.start_screen_id, r.steps FROM ba_processes p
       JOIN process_models m ON m.process_id = p.id AND m.label = 'A'
       JOIN process_model_revisions r ON r.variant_id = m.id AND r.rev = m.rev
       WHERE p.portal_id = ? AND p.archived_at IS NULL ORDER BY p.key`,
    )
    .all(portal) as { id: string; start_screen_id: string | null; steps: string }[];
  const moves = raw
    .prepare(
      `SELECT t.from_screen_id AS f, t.to_screen_id AS t FROM model_transitions t
       JOIN action_classes a ON a.id = t.action_class_id
       JOIN model_screens s ON s.id = t.from_screen_id
       WHERE s.portal_id = ? AND a.is_global = 0 AND t.status <> 'retired' AND t.to_screen_id IS NOT NULL`,
    )
    .all(portal) as { f: string; t: string }[];
  const shapes: ProcessShape[] = [];
  for (const r of rows) {
    const steps = JSON.parse(r.steps) as { state_id: string | null }[];
    const screens = steps.flatMap((s) => {
      const sc = s.state_id ? screenOf.get(s.state_id) : undefined;
      return sc ? [sc] : [];
    });
    const start = r.start_screen_id ?? screens[0];
    if (!start) continue;
    const members = new Set([start, ...screens]);
    const leaves = new Set(
      moves.filter((m) => members.has(m.f) && members.has(m.t) && m.f !== m.t).map((m) => m.f),
    );
    shapes.push({
      id: r.id,
      startScreen: start,
      members,
      terminals: new Set([...members].filter((s) => !leaves.has(s))),
    });
  }
  return shapes;
}

/** The executed transitions of the portal's journeys, on model screens. */
function journeySteps(raw: Raw, portal: string, screenOf: ReadonlyMap<string, string>) {
  const global = new Set(
    (
      raw
        .prepare(
          `SELECT a.screen_id || '|' || a.element_key || '|' || a.kind AS k FROM action_classes a
           JOIN model_screens s ON s.id = a.screen_id WHERE s.portal_id = ? AND a.is_global = 1`,
        )
        .all(portal) as { k: string }[]
    ).map((r) => r.k),
  );
  const rows = raw
    .prepare(
      `SELECT t.id, t.journey_id, t.seq, t.from_state, t.to_state, t.result, t.element_key, t.kind
       FROM transitions t JOIN runs r ON r.id = t.run_id
       WHERE r.portal_id = ? AND t.journey_id IS NOT NULL AND t.seq IS NOT NULL AND t.status = 'executed'`,
    )
    .all(portal) as {
    id: string;
    journey_id: string;
    seq: number;
    from_state: string;
    to_state: string | null;
    result: string | null;
    element_key: string | null;
    kind: string | null;
  }[];
  return rows.map((t): JourneyStep => {
    const from = screenOf.get(t.from_state) ?? null;
    return {
      transitionId: t.id,
      journeyId: t.journey_id,
      seq: t.seq,
      fromScreen: from,
      toScreen: t.to_state ? (screenOf.get(t.to_state) ?? null) : null,
      result: t.result,
      global: from !== null && global.has(`${from}|${t.element_key}|${t.kind}`),
    };
  });
}

/** Every instance of the portal's processes in the current model. */
export function findProcessInstances(raw: Raw, portal: string): ProcessInstance[] {
  const screenOf = screenOfState(raw, portal);
  return processInstances(
    processShapes(raw, portal, screenOf),
    journeySteps(raw, portal, screenOf),
  );
}

/** Write the instances for model version `versionId` (replacing what that version had). */
export function writeProcessInstances(raw: Raw, portal: string, versionId: string): number {
  const found = findProcessInstances(raw, portal);
  raw.prepare('DELETE FROM process_instances WHERE model_version_id = ?').run(versionId);
  const insert = raw.prepare(
    `INSERT INTO process_instances (id, process_id, journey_id, trigger_transition_id,
       last_transition_id, outcome, outcome_screen_id, correlation_id, model_version_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  );
  for (const i of found)
    insert.run(
      newId(),
      i.processId,
      i.journeyId,
      i.triggerTransitionId,
      i.lastTransitionId,
      i.outcome,
      i.outcomeScreen,
      versionId,
    );
  return found.length;
}

/** The trace variants of one process (by key), with screen keys, the most walked first. */
export function processTraceVariants(raw: Raw, portal: string, processKey: string) {
  const id = (
    raw
      .prepare('SELECT id FROM ba_processes WHERE portal_id = ? AND key = ?')
      .get(portal, processKey) as { id: string } | undefined
  )?.id;
  if (!id) return [];
  const keyOf = new Map(
    (
      raw.prepare('SELECT id, key FROM model_screens WHERE portal_id = ?').all(portal) as {
        id: string;
        key: string;
      }[]
    ).map((r) => [r.id, r.key]),
  );
  return traceVariants(findProcessInstances(raw, portal).filter((i) => i.processId === id)).map(
    (v) => ({ ...v, screens: v.screens.map((s) => keyOf.get(s) ?? s) }),
  );
}
