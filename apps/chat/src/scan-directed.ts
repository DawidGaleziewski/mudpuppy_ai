// Directed scans (spec 034 R-66, design 11-map-runs §4–§5): a new run that reaches recorded
// screens by replaying the recorded path (`go_to_state`) instead of mapping from the start page.
// The pathfinder server resolves the plan (marks, the parent's frontier, the failed action) and
// refuses what it cannot replay; the checks here only catch what is missing before the hand-off.

import type BetterSqlite3 from 'better-sqlite3';
import type { DirectedType, ScanPlan } from './scan.js';
import { ScanRefusal } from './scan.js';

const MARKS_FOR: Partial<Record<DirectedType, string[]>> = {
  focused: ['start', 'focus'],
  recheck: ['recheck'],
};

function openMarks(raw: BetterSqlite3.Database, portal: string, kinds: string[]): number {
  const row = raw
    .prepare(
      `SELECT COUNT(*) AS n FROM marks WHERE portal_id = ? AND used_by_run_id IS NULL
       AND kind IN (${kinds.map(() => '?').join(',')})`,
    )
    .get(portal, ...kinds) as { n: number };
  return row.n;
}

/** A directed scan needs what its type starts from: marks, a parent run, or a failed action. */
export function directedScanCheck(
  raw: BetterSqlite3.Database,
  portal: string,
  s: {
    run_type: DirectedType;
    plan: ScanPlan | undefined;
    resume_run_id: string | undefined;
    process: unknown;
    probe: boolean;
  },
): void {
  if (s.resume_run_id !== undefined || s.process !== undefined || s.probe)
    throw new ScanRefusal(
      'INVALID',
      'a directed scan is a new run of its own; it does not resume a scan, trace a process or probe',
    );
  const plan = s.plan ?? {};
  if (s.run_type === 'continue' && plan.parent_run_id === undefined)
    throw new ScanRefusal('MISSING_INPUT', 'continuing a scan needs the scan to continue', [
      'plan.parent_run_id: the stopped scan',
    ]);
  if (s.run_type === 'retry' && plan.target_transition_id === undefined)
    throw new ScanRefusal('MISSING_INPUT', 'retrying a path needs the action that failed', [
      'plan.target_transition_id: the failed action (Scans > the stopped scan > Retry this path)',
    ]);
  const kinds = MARKS_FOR[s.run_type];
  if (kinds !== undefined && plan.start_state_ids === undefined && openMarks(raw, portal, kinds) === 0)
    throw new ScanRefusal('MISSING_INPUT', `no screen of ${portal} is marked for this scan`, [
      s.run_type === 'focused'
        ? 'Start here or Focus marks: the BA marks screens on Scans > Map'
        : 'Recheck marks: the BA marks screens on Scans > Map',
    ]);
  if (plan.parent_run_id !== undefined) {
    const parent = raw.prepare('SELECT portal_id FROM runs WHERE id = ?').get(plan.parent_run_id) as
      | { portal_id: string }
      | undefined;
    if (parent?.portal_id !== portal)
      throw new ScanRefusal('INVALID', `run ${plan.parent_run_id} is not a scan of ${portal}`);
  }
}

const WHAT: Record<DirectedType, string> = {
  continue: 'Continue the stopped scan from the last screen it reached safely',
  focused: 'Map from the marked screens',
  recheck: 'Recheck the marked screens (record what each shows now, explore nothing)',
  retry: 'Retry the failed action',
};

/** The crawler brief for a directed scan: start the typed run, reach each start point, go on. */
export function directedPrompt(
  s: { portal: string; persona: string; environment: string },
  type: DirectedType,
  plan: ScanPlan,
  choiceArgs: string,
): string {
  const after =
    type === 'recheck'
      ? 'Do not act on anything after reaching a start point.'
      : type === 'retry'
        ? 'Then act on the next item the result gives (the failed action, with the variation), once.'
        : 'Then drain the frontier by acting on each result\'s next item (or get_next_frontier_item when a result has none) until there is no next item; if finish_run answers FRONTIER_NOT_EMPTY, continue.';
  return (
    `${WHAT[type]} of portal "${s.portal}" as persona "${s.persona}" in environment ` +
    `"${s.environment}" (a ${type} scan): call start_run with environment "${s.environment}", ` +
    `run_type "${type}" and plan ${JSON.stringify(plan)}.${choiceArgs} Use only the pathfinder ` +
    'tools. If the persona logs in, log in first as a normal scan does. start_run returns ' +
    '`start_points`: reach each, in order, with go_to_state (it replays the recorded path; never ' +
    `navigate to a start point yourself). ${after} When go_to_state answers REPLAY_DIVERGED or ` +
    'NO_PATH for a start point, note its message word for word and go on with the next start ' +
    'point. Always end with finish_run, so the scan never stays running. Stop early only on RUN_STOPPED or a refusal to start. Finish with the ' +
    'run id, its status, which start points were reached (and the messages of those that were ' +
    'not) and, for a retry, whether the action passed.'
  );
}
