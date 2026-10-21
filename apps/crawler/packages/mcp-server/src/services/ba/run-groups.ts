// Run grouping by graph queries (spec 034 R-70 (1), A-6; field finding F-17@030): which runs belong
// to which documented process, so a BA session sees every run of a process, and the runs no
// process owns are listed instead of forgotten. Computed on read, never stored. The dashboard's
// `queries_run_groups.py` is the same model; both are checked against
// `apps/crawler/tests/fixtures/run-groups/cases.json`.

import type { BaContext } from '../../context.js';

export interface GroupProcess {
  key: string;
  title: string;
  /** Screens the process's documentation cites, error states left out. */
  screens: string[];
  /** Runs its documentation cites directly. */
  runs: string[];
}

export interface RunGroupInput {
  runs: string[];
  /** Screens each run observed, error (technical) states left out. */
  screens_of_run: Record<string, string[]>;
  processes: GroupProcess[];
}

export interface RunGroups {
  processes: { key: string; title: string; runs: string[] }[];
  unassigned: string[];
  /** Unassigned runs sharing at least half their screens: a process nobody documented yet. */
  proposed: string[][];
}

const overlap = (a: ReadonlySet<string>, b: readonly string[]) =>
  b.reduce((n, s) => n + (a.has(s) ? 1 : 0), 0);

/** A run belongs to a process it is cited by, or whose screens it walked (two, or the only one). */
function belongs(p: GroupProcess, run: string, screens: readonly string[]): boolean {
  if (p.runs.includes(run)) return true;
  if (p.screens.length === 0) return false;
  return overlap(new Set(p.screens), screens) >= Math.min(2, p.screens.length);
}

function proposedGroups(runs: string[], screensOf: Record<string, string[]>): string[][] {
  const parent = new Map(runs.map((r) => [r, r]));
  const find = (r: string): string => {
    const p = parent.get(r)!;
    return p === r ? r : find(p);
  };
  for (const [i, a] of runs.entries())
    for (const b of runs.slice(i + 1)) {
      const sa = screensOf[a] ?? [];
      const sb = screensOf[b] ?? [];
      const small = Math.min(sa.length, sb.length);
      if (small > 0 && 2 * overlap(new Set(sa), sb) >= small) parent.set(find(b), find(a));
    }
  const groups = new Map<string, string[]>();
  for (const r of runs) groups.set(find(r), [...(groups.get(find(r)) ?? []), r]);
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.sort())
    .sort((x, y) => x[0]!.localeCompare(y[0]!));
}

/** The pure model: processes with their runs, unassigned runs, proposed new groups. */
export function groupRuns(input: RunGroupInput): RunGroups {
  const screensOf = (r: string) => input.screens_of_run[r] ?? [];
  const processes = input.processes.map((p) => ({
    key: p.key,
    title: p.title,
    runs: input.runs.filter((r) => belongs(p, r, screensOf(r))).sort(),
  }));
  const owned = new Set(processes.flatMap((p) => p.runs));
  const unassigned = input.runs.filter((r) => !owned.has(r)).sort();
  return { processes, unassigned, proposed: proposedGroups(unassigned, input.screens_of_run) };
}

/** A screen's key: its screen (after an owner-confirmed merge), else its route and cluster. */
const SCREEN_OF_STATE = `COALESCE(sc.merged_into, s.screen_id, s.route_template || '|' || s.cluster_id)`;

interface LinkRow {
  target_kind: string;
  target_id: string;
  run_id: string | null;
}

/** The states an evidence link points at (a process's screens; also the revision guard's check). */
export function statesOfLink(
  ctx: BaContext,
  l: { target_kind: string; target_id: string },
): string[] {
  const all = (sql: string) =>
    (ctx.raw.prepare(sql).all({ id: l.target_id }) as { s: string | null }[])
      .map((r) => r.s)
      .filter((s): s is string => s !== null);
  switch (l.target_kind) {
    case 'state':
    case 'screen_region':
      return [l.target_id];
    case 'transition':
      return all(
        'SELECT from_state AS s FROM transitions WHERE id = @id UNION SELECT to_state FROM transitions WHERE id = @id',
      );
    case 'observation':
      return all('SELECT state_id AS s FROM observations WHERE id = @id');
    case 'process_step':
      return all(
        'SELECT state_before AS s FROM process_steps WHERE id = @id UNION SELECT state_after FROM process_steps WHERE id = @id',
      );
    case 'process':
      return all(
        'SELECT state_before AS s FROM process_steps WHERE process_id = @id UNION SELECT state_after FROM process_steps WHERE process_id = @id',
      );
    default:
      return [];
  }
}

function screensOfStates(ctx: BaContext, states: readonly string[]): string[] {
  if (states.length === 0) return [];
  const rows = ctx.raw
    .prepare(
      `SELECT DISTINCT ${SCREEN_OF_STATE} AS k FROM states s LEFT JOIN screens sc ON sc.id = s.screen_id
       WHERE s.id IN (${states.map(() => '?').join(',')}) AND s.state_kind <> 'technical'`,
    )
    .all(...states) as { k: string }[];
  return rows.map((r) => r.k).sort();
}

/** The BA's process records (PROC) at their latest revision: cited screens and runs. */
function recordProcesses(ctx: BaContext, portal: string): GroupProcess[] {
  const records = ctx.raw
    .prepare(
      `SELECT r.id, r.key, r.title, v.id AS rev_id FROM doc_records r
       JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev
       WHERE r.portal_id = ? AND r.kind = 'process' AND r.withdrawn = 0 ORDER BY r.seq`,
    )
    .all(portal) as { key: string; title: string; rev_id: string }[];
  return records.map((rec) => {
    const links = ctx.raw
      .prepare(
        'SELECT target_kind, target_id, run_id FROM doc_evidence_links WHERE revision_id = ?',
      )
      .all(rec.rev_id) as LinkRow[];
    const runs = new Set(links.map((l) => l.run_id).filter((r): r is string => r !== null));
    for (const l of links.filter((x) => x.target_kind === 'process')) {
      const trace = ctx.raw
        .prepare('SELECT run_id FROM processes WHERE id = ?')
        .get(l.target_id) as { run_id: string } | undefined;
      if (trace) runs.add(trace.run_id);
    }
    return {
      key: rec.key,
      title: rec.title,
      screens: screensOfStates(
        ctx,
        links.flatMap((l) => statesOfLink(ctx, l)),
      ),
      runs: [...runs].sort(),
    };
  });
}

/** The workspace processes (PRC): the screens of A's head revision and the scans observed into it. */
function workspaceProcesses(ctx: BaContext, portal: string): GroupProcess[] {
  const rows = ctx.raw
    .prepare(
      `SELECT p.key, p.name, r.steps FROM ba_processes p
       JOIN process_models v ON v.process_id = p.id AND v.kind = 'as_is'
       JOIN process_model_revisions r ON r.model_id = v.id AND r.rev = v.rev
       WHERE p.portal_id = ? ORDER BY p.key`,
    )
    .all(portal) as { key: string; name: string; steps: string }[];
  return rows.map((p) => {
    const steps = JSON.parse(p.steps) as { state_id?: string | null }[];
    const states = steps.map((s) => s.state_id).filter((s): s is string => typeof s === 'string');
    const observed = ctx.raw
      .prepare(
        `SELECT DISTINCT r.run_id FROM process_model_revisions r
         JOIN process_models v ON v.id = r.model_id JOIN ba_processes p ON p.id = v.process_id
         WHERE p.portal_id = ? AND p.key = ? AND r.run_id IS NOT NULL`,
      )
      .all(portal, p.key) as { run_id: string }[];
    return {
      key: p.key,
      title: p.name,
      screens: screensOfStates(ctx, states),
      runs: observed.map((r) => r.run_id).sort(),
    };
  });
}

/** Everything `groupRuns` needs for a portal, read from the store. */
export function loadRunGroupInput(ctx: BaContext, portal: string): RunGroupInput {
  const runs = (
    ctx.raw
      .prepare('SELECT id FROM runs WHERE portal_id = ? ORDER BY started_at, id')
      .all(portal) as { id: string }[]
  ).map((r) => r.id);
  const screens_of_run: Record<string, string[]> = {};
  const rows = ctx.raw
    .prepare(
      `SELECT DISTINCT o.run_id AS run, ${SCREEN_OF_STATE} AS k
       FROM state_observations o JOIN runs r ON r.id = o.run_id JOIN states s ON s.id = o.state_id
       LEFT JOIN screens sc ON sc.id = s.screen_id
       WHERE r.portal_id = ? AND s.state_kind <> 'technical' ORDER BY k`,
    )
    .all(portal) as { run: string; k: string }[];
  for (const r of rows) (screens_of_run[r.run] ??= []).push(r.k);
  return {
    runs,
    screens_of_run,
    processes: [...recordProcesses(ctx, portal), ...workspaceProcesses(ctx, portal)],
  };
}
