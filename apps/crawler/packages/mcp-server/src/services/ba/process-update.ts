// `open_process_update` (spec 034 R-70 (2)): one call gives the BA a documented process as it
// stands (its records at their latest revisions), every run of it (the run grouping, not just the
// runs a session was handed), and the difference to document: the screens those runs saw that no
// record cites yet, and the error pages to keep as error branches. The BA then revises instead of
// starting from a blank page (field findings F-17, F-18 of spec 030).

import { z } from 'zod';
import type { BaContext } from '../../context.js';
import { ToolError, parseInput } from '../../errors.js';
import { groupRuns, loadRunGroupInput } from './run-groups.js';

export const OpenProcessUpdateInput = z
  .object({
    portal_id: z.string().min(1),
    /** A process record (`PROC-001`) or a workspace process (`PRC-001`). */
    key: z.string().min(1),
  })
  .strict();

const SCREEN_KEY = `COALESCE(sc.merged_into, s.screen_id, s.route_template || '|' || s.cluster_id)`;
const LIST_CAP = 50;

interface RecordRow {
  key: string;
  kind: string;
  title: string;
  latest_rev: number;
  updated_at: string;
}

interface ScreenRow {
  record: string;
  screen: string;
}

/** Each record's cited screens, from its latest revision's state, edge and visit links. */
function recordScreens(ctx: BaContext, portal: string): ScreenRow[] {
  return ctx.raw
    .prepare(
      `WITH latest AS (
         SELECT r.key, l.target_kind, l.target_id FROM doc_records r
         JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev
         JOIN doc_evidence_links l ON l.revision_id = v.id
         WHERE r.portal_id = ? AND r.withdrawn = 0),
       cited AS (
         SELECT key, target_id AS state FROM latest WHERE target_kind IN ('state', 'screen_region')
         UNION SELECT key, e.from_state FROM latest JOIN transitions e ON e.id = target_id WHERE target_kind = 'transition'
         UNION SELECT key, e.to_state FROM latest JOIN transitions e ON e.id = target_id WHERE target_kind = 'transition'
         UNION SELECT key, p.state_id FROM latest JOIN observations p ON p.id = target_id WHERE target_kind = 'observation')
       SELECT DISTINCT cited.key AS record, ${SCREEN_KEY} AS screen
       FROM cited JOIN states s ON s.id = cited.state LEFT JOIN screens sc ON sc.id = s.screen_id`,
    )
    .all(portal) as ScreenRow[];
}

/** When the process's documentation last changed: a PROC's latest revision, a PRC's A head. */
function lastChanged(ctx: BaContext, portal: string, key: string): string | null {
  const row = (
    key.startsWith('PRC-')
      ? ctx.raw
          .prepare(
            `SELECT r.created_at AS at FROM ba_processes p
             JOIN process_variants v ON v.process_id = p.id AND v.kind = 'as_is'
             JOIN process_variant_revisions r ON r.variant_id = v.id AND r.rev = v.rev
             WHERE p.portal_id = ? AND p.key = ?`,
          )
          .get(portal, key)
      : ctx.raw
          .prepare(
            `SELECT v.created_at AS at FROM doc_records r
             JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev
             WHERE r.portal_id = ? AND r.key = ?`,
          )
          .get(portal, key)
  ) as { at: string } | undefined;
  return row?.at ?? null;
}

interface SeenState {
  state_id: string;
  screen: string;
  route_template: string;
  title: string;
  state_kind: string;
  runs: string;
}

function statesOfRuns(ctx: BaContext, runs: readonly string[]): SeenState[] {
  if (runs.length === 0) return [];
  return ctx.raw
    .prepare(
      `SELECT s.id AS state_id, ${SCREEN_KEY} AS screen, s.route_template, s.title, s.state_kind,
              group_concat(DISTINCT o.run_id) AS runs
       FROM state_observations o JOIN states s ON s.id = o.state_id
       LEFT JOIN screens sc ON sc.id = s.screen_id
       WHERE o.run_id IN (${runs.map(() => '?').join(',')})
       GROUP BY s.id ORDER BY s.route_template, s.title`,
    )
    .all(...runs) as SeenState[];
}

const brief = (s: SeenState) => ({
  state_id: s.state_id,
  route_template: s.route_template,
  title: s.title,
  runs: s.runs.split(','),
});

export function openProcessUpdate(ctx: BaContext, raw: unknown) {
  const { portal_id: portal, key } = parseInput(OpenProcessUpdateInput, raw);
  const groups = groupRuns(loadRunGroupInput(ctx, portal));
  const group = groups.processes.find((p) => p.key === key);
  if (group === undefined)
    throw new ToolError(
      'PROCESS_UNKNOWN',
      `${portal} has no documented process ${key} (a PROC record or a workspace PRC process)`,
      { known: groups.processes.map((p) => p.key) },
    );
  const screens = recordScreens(ctx, portal);
  const seen = statesOfRuns(ctx, group.runs);
  const ownScreens = new Set(seen.filter((s) => s.state_kind !== 'technical').map((s) => s.screen));
  const citedAnywhere = new Set(screens.map((s) => s.screen));
  const related = new Set(screens.filter((s) => ownScreens.has(s.screen)).map((s) => s.record));
  if (!key.startsWith('PRC-')) related.add(key);
  const records = ctx.raw
    .prepare(
      `SELECT key, kind, title, latest_rev, updated_at FROM doc_records
       WHERE portal_id = ? AND withdrawn = 0 AND key IN (${[...related].map(() => '?').join(',') || "''"})
       ORDER BY kind, seq`,
    )
    .all(portal, ...related) as RecordRow[];
  const since = lastChanged(ctx, portal, key);
  const runRows = ctx.raw
    .prepare(
      `SELECT id, mode, persona_id, status, started_at FROM runs
       WHERE id IN (${group.runs.map(() => '?').join(',') || "''"}) ORDER BY started_at`,
    )
    .all(...group.runs) as { id: string; started_at: string }[];
  const uncited = seen.filter((s) => s.state_kind !== 'technical' && !citedAnywhere.has(s.screen));
  const errors = seen.filter((s) => s.state_kind === 'technical');
  return {
    process: { key, title: group.title, last_changed: since },
    records,
    runs: runRows.map((r) => ({
      ...r,
      new_since_last_change: since !== null && r.started_at > since,
    })),
    uncited_screens: uncited.slice(0, LIST_CAP).map(brief),
    uncited_total: uncited.length,
    error_branches: errors.slice(0, LIST_CAP).map(brief),
    next: 'start_session with these run ids, read the new runs and uncited screens with get_run_evidence, then revise the records listed here (keep their evidence; "dropped" only with a reason) and create records for what is new. Error branches are documented as error branches, never as the process.',
  };
}
