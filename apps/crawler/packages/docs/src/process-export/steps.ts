// The steps of a documented process in walking order (spec 034 FR-013; spec 027 FR-010), shared by
// the process export and the dashboard. A BA process record (PROC) is resolved from its latest
// revision's evidence: the trace it cites, else its cited trace steps, else its cited transitions chained
// from the screen nothing leads into. A workspace process (PRC) is A's latest revision. A cited
// state of a page the walk already passed is a state of that step (a variant, an error), never a
// step of its own (owner review 2026-10-17: "why is there a step 7?"); only a page the walk did
// not pass is listed after the ordered steps ("also cited").

import type { RawDb } from '../keys.js';
import { statesOfStep, type StepHead, type StepState } from './step-states.js';

export type { StepState } from './step-states.js';

export interface ProcessStep {
  n: number;
  /** The step's main state: the one the walk passed through. */
  state_id: string;
  screen_id: string | null;
  title: string;
  route_template: string;
  /** Every recorded state of the step's screen (same form step when it has one): happy, error… */
  states: StepState[];
  /** Cited, but not on the walk. */
  also_cited: boolean;
}

export interface ResolvedProcess {
  key: string;
  kind: 'record' | 'workspace';
  title: string;
  steps: ProcessStep[];
  /** Runs the steps were read from (a trace, the cited transitions' runs, the observed revisions). */
  runs: string[];
}

interface Link {
  target_kind: string;
  target_id: string;
  run_id: string | null;
}

const rows = <T>(raw: RawDb, sql: string, ...args: unknown[]): T[] =>
  raw.prepare(sql).all(...args) as T[];

/** Consecutive duplicates removed, order kept. */
function walk(states: readonly (string | null)[]): string[] {
  const out: string[] = [];
  for (const s of states) if (s !== null && out[out.length - 1] !== s) out.push(s);
  return out;
}

/**
 * The states a trace walked, in order. A trace that marked its trigger (spec 039 T081) starts at
 * the screen its trigger step entered: the pages before it are the trigger's context, not steps.
 */
function traceWalk(raw: RawDb, processIds: readonly string[]): string[] {
  const out: (string | null)[] = [];
  for (const id of processIds) {
    const trigger = rows<{ t: number | null }>(
      raw,
      'SELECT trigger_ord AS t FROM processes WHERE id = ?',
      id,
    )[0]?.t;
    const steps = rows<{ state_before: string | null; state_after: string | null }>(
      raw,
      'SELECT state_before, state_after FROM process_steps WHERE process_id = ? AND ord >= ? ORDER BY ord',
      id,
      trigger ?? 0,
    );
    for (const s of steps) out.push(trigger ? null : s.state_before, s.state_after);
  }
  return walk(out);
}

function stepsWalk(raw: RawDb, stepIds: readonly string[]): string[] {
  if (stepIds.length === 0) return [];
  const steps = rows<{ state_before: string | null; state_after: string | null }>(
    raw,
    `SELECT state_before, state_after FROM process_steps WHERE id IN (${stepIds.map(() => '?').join(',')})
     ORDER BY process_id, ord`,
    ...stepIds,
  );
  return walk(steps.flatMap((s) => [s.state_before, s.state_after]));
}

/** Cited transitions chained from the state none of them leads into; a loop back is not a new step. */
function transitionWalk(raw: RawDb, transitionIds: readonly string[]): string[] {
  if (transitionIds.length === 0) return [];
  const transitions = rows<{ from_state: string; to_state: string | null; created_at: string }>(
    raw,
    `SELECT from_state, to_state, created_at FROM transitions
     WHERE id IN (${transitionIds.map(() => '?').join(',')}) ORDER BY created_at`,
    ...transitionIds,
  );
  const into = new Set(transitions.map((e) => e.to_state));
  let at: string | undefined =
    transitions.find((e) => !into.has(e.from_state))?.from_state ?? transitions[0]?.from_state;
  const out: string[] = [];
  while (at !== undefined && !out.includes(at)) {
    out.push(at);
    const here: string = at;
    at =
      transitions.find(
        (e) => e.from_state === here && e.to_state !== null && !out.includes(e.to_state),
      )?.to_state ?? undefined;
  }
  return out;
}

function headOf(raw: RawDb, stateId: string): StepHead | undefined {
  return rows<StepHead>(
    raw,
    'SELECT id, screen_id, title, route_template, form_step_id, portal_id, state_kind FROM states WHERE id = ?',
    stateId,
  )[0];
}

/** A step is a page (route, and the form step on a same-URL wizard): the key that folds states. */
const pageKey = (h: StepHead): string => `${h.route_template}|${h.form_step_id ?? ''}`;

function toSteps(raw: RawDb, ordered: readonly string[], extra: readonly string[]): ProcessStep[] {
  const out: ProcessStep[] = [];
  const seen = new Set<string>();
  for (const [i, id] of [...ordered, ...extra].entries()) {
    const head = headOf(raw, id);
    // A page the process already has: this state is one of that step's (statesOfStep lists it).
    // An error page has no form step: any step on its route holds it.
    const known =
      head !== undefined &&
      (seen.has(pageKey(head)) ||
        (head.state_kind === 'technical' &&
          [...seen].some((k) => k.startsWith(`${head.route_template}|`))));
    if (head === undefined || known) continue;
    seen.add(pageKey(head));
    const states = statesOfStep(raw, head);
    // A cited error state names its step by the page's happy-path state when one was recorded.
    const lead = states[0] ?? null;
    out.push({
      n: out.length + 1,
      state_id: lead?.state_id ?? id,
      screen_id: head.screen_id,
      title: lead?.title ?? head.title,
      route_template: head.route_template,
      states,
      also_cited: i >= ordered.length,
    });
  }
  return out;
}

/** Routes of the screens the record says the process contains (R-51 `process contains screen`). */
function containedRoutes(raw: RawDb, revId: string): Set<string> {
  return new Set(
    rows<{ route_template: string }>(
      raw,
      `SELECT DISTINCT s.route_template FROM doc_relations rel
       JOIN doc_records scr ON scr.id = rel.to_record_id AND scr.kind = 'screen'
       JOIN doc_revisions sv ON sv.record_id = scr.id AND sv.rev_no = scr.latest_rev
       JOIN doc_evidence_links l ON l.revision_id = sv.id AND l.target_kind IN ('state', 'screen_region')
       JOIN states s ON s.id = l.target_id
       WHERE rel.from_revision_id = ? AND rel.type = 'contains'`,
      revId,
    ).map((r) => r.route_template),
  );
}

/**
 * The walk from the process's first page on (spec 036 FR-006, F-15@034): a trace that set off from
 * the home page walked it first, but the process starts at its first contained screen. Without
 * `contains` links, or when none of them is on the walk, the walk is kept as it is.
 */
function fromFirstContained(raw: RawDb, ordered: string[], routes: Set<string>): string[] {
  const first = ordered.findIndex((id) => {
    const head = headOf(raw, id);
    return head !== undefined && routes.has(head.route_template);
  });
  return first > 0 ? ordered.slice(first) : ordered;
}

function recordProcess(raw: RawDb, portal: string, key: string): ResolvedProcess | null {
  const [rec] = rows<{ title: string; rev_id: string }>(
    raw,
    `SELECT r.title, v.id AS rev_id FROM doc_records r
     JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev
     WHERE r.portal_id = ? AND r.key = ? AND r.kind = 'process' AND r.withdrawn = 0`,
    portal,
    key,
  );
  if (rec === undefined) return null;
  const links = rows<Link>(
    raw,
    'SELECT target_kind, target_id, run_id FROM doc_evidence_links WHERE revision_id = ? ORDER BY rowid',
    rec.rev_id,
  );
  const of = (kind: string) => links.filter((l) => l.target_kind === kind).map((l) => l.target_id);
  let ordered = traceWalk(raw, of('process'));
  if (ordered.length === 0) ordered = stepsWalk(raw, of('process_step'));
  if (ordered.length === 0) ordered = transitionWalk(raw, of('transition'));
  ordered = fromFirstContained(raw, ordered, containedRoutes(raw, rec.rev_id));
  const cited = [...of('state'), ...of('screen_region')];
  const extra = [...new Set(cited)].filter((s) => !ordered.includes(s));
  if (ordered.length === 0) ordered = extra.splice(0);
  const runs = new Set(links.map((l) => l.run_id).filter((r): r is string => r !== null));
  for (const p of of('process'))
    for (const r of rows<{ run_id: string }>(raw, 'SELECT run_id FROM processes WHERE id = ?', p))
      runs.add(r.run_id);
  return {
    key,
    kind: 'record',
    title: rec.title,
    steps: toSteps(raw, ordered, extra),
    runs: [...runs].sort(),
  };
}

function workspaceProcess(raw: RawDb, portal: string, key: string): ResolvedProcess | null {
  const [p] = rows<{ name: string; steps: string }>(
    raw,
    `SELECT p.name, r.steps FROM ba_processes p
     JOIN process_models v ON v.process_id = p.id AND v.kind = 'as_is'
     JOIN process_model_revisions r ON r.variant_id = v.id AND r.rev = v.rev
     WHERE p.portal_id = ? AND p.key = ?`,
    portal,
    key,
  );
  if (p === undefined) return null;
  const states = (JSON.parse(p.steps) as { state_id?: unknown }[])
    .map((s) => s.state_id)
    .filter((s): s is string => typeof s === 'string');
  const runs = rows<{ run_id: string }>(
    raw,
    `SELECT DISTINCT r.run_id FROM process_model_revisions r JOIN process_models v ON v.id = r.variant_id
     JOIN ba_processes p ON p.id = v.process_id WHERE p.portal_id = ? AND p.key = ? AND r.run_id IS NOT NULL`,
    portal,
    key,
  ).map((r) => r.run_id);
  return {
    key,
    kind: 'workspace',
    title: p.name,
    steps: toSteps(raw, walk(states), []),
    runs: runs.sort(),
  };
}

/** A documented process's steps, or null when the portal has no such process. */
export function resolveProcessSteps(
  raw: RawDb,
  portal: string,
  key: string,
): ResolvedProcess | null {
  return key.startsWith('PRC-')
    ? workspaceProcess(raw, portal, key)
    : recordProcess(raw, portal, key);
}

/** Every documented process of a portal: PROC records first, then workspace processes. */
export function processKeys(raw: RawDb, portal: string): string[] {
  const records = rows<{ key: string }>(
    raw,
    "SELECT key FROM doc_records WHERE portal_id = ? AND kind = 'process' AND withdrawn = 0 ORDER BY seq",
    portal,
  ).map((r) => r.key);
  let workspace: string[];
  try {
    // A process its PROC record documents is that record's (one concept, spec 039 T070).
    workspace = rows<{ key: string }>(
      raw,
      `SELECT p.key FROM ba_processes p WHERE p.portal_id = ? AND NOT EXISTS (
         SELECT 1 FROM doc_records r WHERE r.process_id = p.id AND r.kind = 'process' AND r.withdrawn = 0)
       ORDER BY p.key`,
      portal,
    ).map((r) => r.key);
  } catch {
    workspace = []; // a store from before spec 022
  }
  return [...records, ...workspace];
}
