import { parameterInventory, type VisitRow } from '@pathfinder/docs';
import { z } from 'zod';
import type { BaContext } from '../../context.js';
import { ToolError, parseInput } from '../../errors.js';
import { json } from './common.js';

/** `get_run_evidence` (moved out of `reads.ts`, G-01/G-06; spec 019 adds observations and parameters). */

export const EVIDENCE_PAGE_MAX = 200;
const EVIDENCE_PAGE_DEFAULT = 50;

type Row = Record<string, unknown>;

export const RunEvidenceKind = z.enum([
  'states',
  'transitions',
  'actions',
  'forms',
  'network_calls',
  'observations',
  'parameters',
  'open_questions',
  'decisions',
  'probe_outcomes',
]);
export type RunEvidenceKind = z.infer<typeof RunEvidenceKind>;

export const GetRunEvidenceInput = z
  .object({
    run_id: z.string().min(1),
    kind: RunEvidenceKind,
    cursor: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(EVIDENCE_PAGE_MAX).default(EVIDENCE_PAGE_DEFAULT),
  })
  .strict();

/** The action a row describes, without locators and snapshot refs. */
function actionSummary(actionJson: string): Row {
  const a = json<Row>(actionJson);
  return { role: a.role ?? null, name: a.accessible_name ?? null, ...actionTarget(a) };
}

/** The `href` and `form` of an action's JSON, when it has them. */
function actionTarget(a: Row): Row {
  const form = a.form as Row | undefined;
  return {
    ...(a.href !== undefined ? { href: a.href } : {}),
    ...(form ? { form: { method: form.method ?? null, action: form.action ?? null } } : {}),
  };
}

interface Source {
  sql: string;
  summarise: (row: Row) => Row;
}

/** Per kind: the page query (keyset on `id`) and the compact summary of one row. */
const RUN_EVIDENCE: Record<Exclude<RunEvidenceKind, 'parameters'>, Source> = {
  states: {
    // Spec 032: the form step a state belongs to (its number and label on the route) and its kind.
    sql: `SELECT s.id, s.title, s.route_template, s.cluster_id, s.confidence, s.stabilization,
                 s.form_step_id, f.step_index, f.label AS step_label, s.state_kind
          FROM state_observations o JOIN states s ON s.id = o.state_id
          LEFT JOIN form_steps f ON f.id = s.form_step_id
          WHERE o.run_id = ? AND s.id > ? ORDER BY s.id LIMIT ?`,
    summarise: (r) => r,
  },
  // Spec 032 US4: what each form probe did, with the field messages and the state it landed on.
  probe_outcomes: {
    sql: `SELECT id, from_state_id, form_step_id, probe_id AS probe, probe_group, target, fault,
                 outcome_kind, to_state_id, accepted, possible_new_process, messages_json,
                 http_status, reason
          FROM probe_outcomes WHERE run_id = ? AND id > ? ORDER BY id LIMIT ?`,
    summarise: ({ messages_json, accepted, possible_new_process, ...r }) => ({
      ...r,
      messages: json(messages_json as string),
      accepted: accepted === 1,
      possible_new_process: possible_new_process === 1,
    }),
  },
  transitions: {
    sql: `SELECT e.id, e.from_state, e.to_state, e.action_json, e.safety_class, e.status, e.confidence,
                 f.route_template AS from_route, t.route_template AS to_route
          FROM transitions e JOIN states f ON f.id = e.from_state LEFT JOIN states t ON t.id = e.to_state
          WHERE e.run_id = ? AND e.id > ? ORDER BY e.id LIMIT ?`,
    summarise: ({ action_json, ...r }) => ({ ...r, action: actionSummary(action_json as string) }),
  },
  actions: {
    sql: `SELECT id, state_id, role, accessible_name, action_json, safety_class, allowed, skip_reason
          FROM actions WHERE run_id = ? AND id > ? ORDER BY id LIMIT ?`,
    // The row's own role and accessible name are the real ones (the JSON has neither); href and
    // form come from the JSON.
    summarise: ({ action_json, allowed, accessible_name, ...r }) => ({
      ...r,
      name: accessible_name,
      allowed: allowed === 1,
      ...actionTarget(json<Row>(action_json as string)),
    }),
  },
  forms: {
    sql: `SELECT f.id, f.state_id, s.route_template, f.fields_json, f.confidence
          FROM forms f JOIN states s ON s.id = f.state_id
          WHERE f.run_id = ? AND f.id > ? ORDER BY f.id LIMIT ?`,
    summarise: ({ fields_json, ...r }) => ({ ...r, fields: json(fields_json as string) }),
  },
  network_calls: {
    sql: `SELECT id, transition_id, method, url_template, url, status, req_schema, res_schema, console_errors
          FROM network_calls WHERE run_id = ? AND id > ? ORDER BY id LIMIT ?`,
    summarise: ({ req_schema, res_schema, console_errors, ...r }) => ({
      ...r,
      req_schema: json(req_schema as string),
      res_schema: json(res_schema as string),
      console_errors: json(console_errors as string),
    }),
  },
  // Spec 019 (R-37/R-38): every arrival on a page, its verbatim URL and the hops that led there.
  observations: {
    sql: `SELECT v.id, v.state_id, s.route_template, v.via, v.transition_id, v.url, v.hops_json
          FROM observations v JOIN states s ON s.id = v.state_id
          WHERE v.run_id = ? AND v.id > ? ORDER BY v.id LIMIT ?`,
    summarise: ({ hops_json, ...r }) => ({ ...r, hops: json(hops_json as string) }),
  },
  open_questions: {
    sql: `SELECT q.id, q.text, coalesce(r.state_id, r.transition_id, r.form_id) AS about_ref,
            q.status FROM open_questions q JOIN entity_refs r ON r.id = q.ref_id
          WHERE q.run_id = ? AND q.id > ? ORDER BY q.id LIMIT ?`,
    summarise: (r) => r,
  },
  decisions: {
    sql: `SELECT id, kind, rule, reason, subject_ref FROM decision_log
          WHERE run_id = ? AND id > ? ORDER BY id LIMIT ?`,
    summarise: (r) => r,
  },
};

function requireRun(ctx: BaContext, runId: string): { id: string; portal_id: string } {
  const run = ctx.raw.prepare('SELECT id, portal_id FROM runs WHERE id = ?').get(runId) as
    { id: string; portal_id: string } | undefined;
  if (!run) throw new ToolError('RUN_NOT_FOUND', `run ${runId} does not exist`, { run_id: runId });
  return run;
}

/**
 * Per kind, the values most items share, stated once on the page (spec 013 US5). Actions and
 * network calls are always seen by the server, so their `confidence` is always the default.
 */
const PAGE_DEFAULTS: Partial<Record<RunEvidenceKind, Row>> = {
  states: { confidence: 'observed', stabilization: 'settled', state_kind: 'main' },
  probe_outcomes: { accepted: false, possible_new_process: false },
  transitions: { safety_class: 'read', status: 'executed', confidence: 'observed' },
  actions: { safety_class: 'read', allowed: true, confidence: 'observed' },
  forms: { confidence: 'observed' },
  network_calls: { confidence: 'observed' },
  observations: { via: 'action' },
};

/** The item without null fields and without fields equal to the page's default. */
function compact(item: Row, defaults: Row): Row {
  return Object.fromEntries(
    Object.entries(item).filter(([k, v]) => v !== null && !(k in defaults && defaults[k] === v)),
  );
}

/**
 * The run's parameter inventory, one item per state (spec 019, R-37): every query, path and
 * hash-route parameter its URLs carried, the values seen and where they were set, and the URLs the
 * state was reached under. Keyset on the state id.
 */
function parameterPage(ctx: BaContext, runId: string, cursor: string, limit: number): Row[] {
  const visits = (
    ctx.raw
      .prepare(
        `SELECT id, state_id, transition_id, via, url, hops_json FROM observations
         WHERE run_id = ? ORDER BY created_at, rowid`,
      )
      .all(runId) as (Omit<VisitRow, 'hops'> & { hops_json: string })[]
  ).map(({ hops_json, ...v }) => ({ ...v, hops: json<VisitRow['hops']>(hops_json) }));
  const route = ctx.raw.prepare('SELECT route_template FROM states WHERE id = ?');
  return parameterInventory(visits)
    .filter((s) => s.state_id > cursor)
    .sort((a, b) => (a.state_id < b.state_id ? -1 : 1))
    .slice(0, limit)
    .map(({ state_id, ...s }) => ({
      id: state_id,
      route_template: (route.get(state_id) as { route_template: string } | undefined)
        ?.route_template,
      ...s,
    }));
}

/**
 * One page of a run's Layer A records of one kind; pass `next_cursor` back to continue.
 * A missing field is null, or the page's `defaults` value when `defaults` names it.
 */
export function getRunEvidence(
  ctx: BaContext,
  raw: unknown,
): {
  run_id: string;
  portal_id: string;
  kind: RunEvidenceKind;
  defaults?: Row;
  items: Row[];
  next_cursor: string | null;
} {
  const input = parseInput(GetRunEvidenceInput, raw);
  const run = requireRun(ctx, input.run_id);
  const defaults = PAGE_DEFAULTS[input.kind];
  const cursor = input.cursor ?? '';
  // One row more than asked for tells whether another page exists.
  const rows =
    input.kind === 'parameters'
      ? parameterPage(ctx, run.id, cursor, input.limit + 1)
      : (ctx.raw
          .prepare(RUN_EVIDENCE[input.kind].sql)
          .all(run.id, cursor, input.limit + 1) as Row[]);
  const summarise =
    input.kind === 'parameters' ? (r: Row) => r : RUN_EVIDENCE[input.kind].summarise;
  const page = rows.slice(0, input.limit);
  return {
    run_id: run.id,
    portal_id: run.portal_id,
    kind: input.kind,
    ...(defaults ? { defaults } : {}),
    items: page.map((r) => compact(summarise(r), defaults ?? {})),
    next_cursor: rows.length > input.limit ? (page.at(-1)!.id as string) : null,
  };
}
