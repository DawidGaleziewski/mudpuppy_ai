/**
 * The narrow step of a trial with process traces (spec 034 F-20, owner decision 2026-10-17: "test
 * it the way we use it"): before the traces BA session, each trace run is grouped under its
 * ground-truth process, as the owner does by accepting a grouping in Processes. One workspace
 * process (PRC) per trace, named after it, its as-is A r1 the screens the run walked in order.
 */
import { join } from 'node:path';
import { newId, nowIso } from '@pathfinder/core';
import { runStates } from '@pathfinder/mcp-server';
import { dbPathFor, openDb } from '@pathfinder/store';
import type { EvalConfig } from '../config.js';

/** What the grouping step needs of a trace: its name and its run. */
export interface TraceToGroup {
  name: string;
  runId: string;
}

/** A trace run grouped as a workspace process. */
export interface GroupedTrace {
  key: string;
  name: string;
  runId: string;
}

/** The as-is steps of a run (the chat service's `observedSteps`, spec 022 M5). */
function stepsOf(states: ReturnType<typeof runStates>) {
  return states.map((s, i) => ({
    id: `s${String(i + 1)}`,
    title: s.title,
    route: s.route_template,
    state_id: s.id,
    screen_id: s.screen_id,
    observed: true,
    from: [],
    annotations: [],
  }));
}

const key = (n: number) => `PRC-${String(n).padStart(3, '0')}`;

/** Group each trace run as its own process; a run that walked no screen is left ungrouped. */
export async function groupTraceRuns(
  c: EvalConfig,
  ws: string,
  traces: readonly TraceToGroup[],
): Promise<GroupedTrace[]> {
  const opened = openDb(dbPathFor(join(ws, 'data'), c.env));
  const { raw } = opened;
  try {
    const used = raw
      .prepare('SELECT count(*) AS n FROM ba_processes WHERE portal_id = ?')
      .get(c.portal) as { n: number };
    const grouped: GroupedTrace[] = [];
    const insert = raw.transaction((t: TraceToGroup, k: string, steps: string) => {
      const at = nowIso();
      const processId = newId();
      const modelId = newId();
      raw
        .prepare(
          `INSERT INTO ba_processes (id, portal_id, key, name, persona, stage, rev, source, scope_id, suggestion_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'scoped', 1, 'new', NULL, NULL, ?, ?)`,
        )
        .run(processId, c.portal, k, t.name, c.persona, at, at);
      raw
        .prepare(
          `INSERT INTO ba_process_revisions (process_id, rev, base_rev, change, author, name, stage, created_at)
           VALUES (?, 1, NULL, 'create', 'eval', ?, 'scoped', ?)`,
        )
        .run(processId, t.name, at);
      raw
        .prepare(
          `INSERT INTO process_models (id, process_id, label, kind, rev, branched_from_model_id, branched_from_rev, created_at)
           VALUES (?, ?, 'A', 'as_is', 1, NULL, NULL, ?)`,
        )
        .run(modelId, processId, at);
      raw
        .prepare(
          `INSERT INTO process_model_revisions (model_id, rev, base_rev, change, author, steps, note, run_id, restored_from, created_at)
           VALUES (?, 1, NULL, 'create', 'eval', ?, 'Grouped from the trace run', ?, NULL, ?)`,
        )
        .run(modelId, steps, t.runId, at);
    });
    for (const t of traces) {
      const states = runStates({ raw }, t.runId);
      if (states.length === 0) {
        console.log(`grouping: trace run ${t.runId} ("${t.name}") walked no screen; not grouped`);
        continue;
      }
      const k = key(used.n + grouped.length + 1);
      insert(t, k, JSON.stringify(stepsOf(states)));
      grouped.push({ key: k, name: t.name, runId: t.runId });
    }
    console.log(`grouping: ${grouped.map((g) => `${g.key} ← ${g.runId}`).join(', ') || 'none'}`);
    return grouped;
  } finally {
    await opened.close();
  }
}
