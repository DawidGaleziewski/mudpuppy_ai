import { readFile } from 'node:fs/promises';
import { DocKind, RevisionStatus, isEvidenceRef } from '@pathfinder/core';
import { z } from 'zod';
import type { BaContext } from '../../context.js';
import { ToolError, parseInput } from '../../errors.js';
import { json } from './common.js';

/** Evidence file content is cut here so one snapshot cannot fill the agent's context. */
export const EVIDENCE_CONTENT_LIMIT = 60_000;
export const EVIDENCE_PAGE_MAX = 200;
const EVIDENCE_PAGE_DEFAULT = 50;

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------------------------------
// list_runs

export const ListRunsInput = z.object({ portal_id: z.string().min(1) }).strict();

const RUN_COUNTS: Record<string, string> = {
  states: 'state_observations',
  edges: 'edges',
  forms: 'forms',
  network_calls: 'network_calls',
  actions: 'actions',
  open_questions: 'open_questions',
  rule_candidates: 'rule_candidates',
};

/** Runs of a portal, oldest first, with how much each recorded. */
export function listRuns(ctx: BaContext, raw: unknown): { runs: Row[] } {
  const input = parseInput(ListRunsInput, raw);
  const counts = Object.entries(RUN_COUNTS)
    .map(([name, table]) => `(SELECT COUNT(*) FROM ${table} t WHERE t.run_id = runs.id) AS ${name}`)
    .join(', ');
  const rows = ctx.raw
    .prepare(
      `SELECT id, mode, persona_id, environment, status, warning, started_at, ended_at,
              (SELECT p.name FROM processes p WHERE p.run_id = runs.id) AS process_name, ${counts}
       FROM runs WHERE portal_id = ? ORDER BY id`,
    )
    .all(input.portal_id) as Row[];
  return {
    runs: rows.map((r) => {
      const {
        id,
        mode,
        persona_id,
        environment,
        status,
        warning,
        started_at,
        ended_at,
        process_name,
        ...n
      } = r;
      return {
        run_id: id,
        mode,
        persona_id,
        environment,
        status,
        warning,
        started_at,
        ended_at,
        counts: n,
        // Trace runs name their process; map runs have none.
        process_name: process_name ?? null,
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------------
// get_run_evidence

export const RunEvidenceKind = z.enum([
  'states',
  'edges',
  'actions',
  'forms',
  'network_calls',
  'open_questions',
  'rule_candidates',
  'decisions',
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
  const form = a.form as Row | undefined;
  return {
    role: a.role ?? null,
    name: a.accessible_name ?? null,
    ...(a.href !== undefined ? { href: a.href } : {}),
    ...(form ? { form: { method: form.method ?? null, action: form.action ?? null } } : {}),
  };
}

/** Per kind: the page query (keyset on `id`) and the compact summary of one row. */
const RUN_EVIDENCE: Record<RunEvidenceKind, { sql: string; summarise: (row: Row) => Row }> = {
  states: {
    sql: `SELECT s.id, s.title, s.route_template, s.cluster_id, s.confidence, s.stabilization
          FROM state_observations o JOIN states s ON s.id = o.state_id
          WHERE o.run_id = ? AND s.id > ? ORDER BY s.id LIMIT ?`,
    summarise: (r) => r,
  },
  edges: {
    sql: `SELECT e.id, e.from_state, e.to_state, e.action_json, e.safety_class, e.status, e.confidence,
                 f.route_template AS from_route, t.route_template AS to_route
          FROM edges e JOIN states f ON f.id = e.from_state LEFT JOIN states t ON t.id = e.to_state
          WHERE e.run_id = ? AND e.id > ? ORDER BY e.id LIMIT ?`,
    summarise: ({ action_json, ...r }) => ({ ...r, action: actionSummary(action_json as string) }),
  },
  actions: {
    sql: `SELECT id, state_id, role, accessible_name, action_json, safety_class, allowed, skip_reason
          FROM actions WHERE run_id = ? AND id > ? ORDER BY id LIMIT ?`,
    summarise: ({ action_json, allowed, ...r }) => ({
      ...r,
      allowed: allowed === 1,
      ...actionSummary(action_json as string),
      // Every action was seen on the page by the server, whether or not it was allowed to run.
      confidence: 'observed',
    }),
  },
  forms: {
    sql: `SELECT f.id, f.state_id, s.route_template, f.fields_json, f.confidence
          FROM forms f JOIN states s ON s.id = f.state_id
          WHERE f.run_id = ? AND f.id > ? ORDER BY f.id LIMIT ?`,
    summarise: ({ fields_json, ...r }) => ({ ...r, fields: json(fields_json as string) }),
  },
  network_calls: {
    sql: `SELECT id, edge_id, method, url_template, status, req_schema, res_schema, console_errors
          FROM network_calls WHERE run_id = ? AND id > ? ORDER BY id LIMIT ?`,
    summarise: ({ req_schema, res_schema, console_errors, ...r }) => ({
      ...r,
      req_schema: json(req_schema as string),
      res_schema: json(res_schema as string),
      console_errors: json(console_errors as string),
      confidence: 'observed',
    }),
  },
  open_questions: {
    sql: `SELECT id, text, about_ref, status FROM open_questions
          WHERE run_id = ? AND id > ? ORDER BY id LIMIT ?`,
    summarise: (r) => r,
  },
  rule_candidates: {
    sql: `SELECT id, text, about_ref, confidence FROM rule_candidates
          WHERE run_id = ? AND id > ? ORDER BY id LIMIT ?`,
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

/** One page of a run's Layer A records of one kind; pass `next_cursor` back to continue. */
export function getRunEvidence(
  ctx: BaContext,
  raw: unknown,
): {
  run_id: string;
  portal_id: string;
  kind: RunEvidenceKind;
  items: Row[];
  next_cursor: string | null;
} {
  const input = parseInput(GetRunEvidenceInput, raw);
  const run = requireRun(ctx, input.run_id);
  const { sql, summarise } = RUN_EVIDENCE[input.kind];
  // One row more than asked for tells whether another page exists.
  const rows = ctx.raw.prepare(sql).all(run.id, input.cursor ?? '', input.limit + 1) as Row[];
  const page = rows.slice(0, input.limit);
  return {
    run_id: run.id,
    portal_id: run.portal_id,
    kind: input.kind,
    items: page.map(summarise),
    next_cursor: rows.length > input.limit ? (page.at(-1)!.id as string) : null,
  };
}

// ---------------------------------------------------------------------------------------------------
// get_evidence

/** Layer A kinds this tool reads; records and reviews are read with `get_record`. */
export const EvidenceReadKind = z.enum([
  'state',
  'edge',
  'action',
  'form',
  'network_call',
  'rule_candidate',
  'open_question',
  'decision',
]);
export type EvidenceReadKind = z.infer<typeof EvidenceReadKind>;

export const GetEvidenceInput = z
  .object({ target_kind: EvidenceReadKind, target_id: z.string().min(1) })
  .strict();

const EVIDENCE_TABLE: Record<EvidenceReadKind, string> = {
  state: 'states',
  edge: 'edges',
  action: 'actions',
  form: 'forms',
  network_call: 'network_calls',
  rule_candidate: 'rule_candidates',
  open_question: 'open_questions',
  decision: 'decision_log',
};

const JSON_COLUMNS = new Set([
  'action_json',
  'fields_json',
  'req_schema',
  'res_schema',
  'console_errors',
  'detail_json',
  'error',
]);

export interface EvidenceFile {
  ref: string;
  /** Masked ARIA snapshot or shape JSON; null when the file is gone. */
  content: string | null;
  truncated: boolean;
  bytes: number;
}

/** The evidence file a record points at, cut to the limit. Files hold only masked content. */
async function readEvidenceFile(ctx: BaContext, ref: string): Promise<EvidenceFile> {
  let buf: Buffer;
  try {
    buf = await readFile(ctx.evidence.resolve(ref));
  } catch {
    return { ref, content: null, truncated: false, bytes: 0 };
  }
  const truncated = buf.byteLength > EVIDENCE_CONTENT_LIMIT;
  const content = truncated
    ? // A cut may split a multi-byte character; drop the broken tail.
      buf.subarray(0, EVIDENCE_CONTENT_LIMIT).toString('utf8').replace(/�+$/, '')
    : buf.toString('utf8');
  return { ref, content, truncated, bytes: buf.byteLength };
}

/** The full Layer A record, with the content of its evidence file when it has one. */
export async function getEvidence(
  ctx: BaContext,
  raw: unknown,
): Promise<{ target_kind: EvidenceReadKind; record: Row; evidence: EvidenceFile | null }> {
  const input = parseInput(GetEvidenceInput, raw);
  const row = ctx.raw
    .prepare(`SELECT * FROM ${EVIDENCE_TABLE[input.target_kind]} WHERE id = ?`)
    .get(input.target_id) as Row | undefined;
  if (!row)
    throw new ToolError('UNKNOWN_REF', `no ${input.target_kind} with id ${input.target_id}`, {
      target_kind: input.target_kind,
      target_id: input.target_id,
    });

  const record: Row = {};
  for (const [k, v] of Object.entries(row))
    record[k] = JSON_COLUMNS.has(k) && typeof v === 'string' ? json(v) : v;
  if (input.target_kind === 'state')
    record.observed_in_runs = (
      ctx.raw
        .prepare('SELECT run_id FROM state_observations WHERE state_id = ? ORDER BY run_id')
        .all(input.target_id) as { run_id: string }[]
    ).map((r) => r.run_id);

  // An action has no evidence column of its own: its snapshot is the one its locators came from.
  const ref =
    row.evidence_ref ??
    (record.action_json as { snapshot_ref?: unknown } | undefined)?.snapshot_ref;
  const evidence =
    typeof ref === 'string' && isEvidenceRef(ref) ? await readEvidenceFile(ctx, ref) : null;
  return { target_kind: input.target_kind, record, evidence };
}

// ---------------------------------------------------------------------------------------------------
// list_records, get_record

export const ListRecordsInput = z
  .object({
    portal_id: z.string().min(1),
    kind: DocKind.optional(),
    status: RevisionStatus.optional(),
    include_withdrawn: z.boolean().default(false),
  })
  .strict();

/** Keys and titles of a portal's records with the state of each one's latest revision. */
export function listRecords(ctx: BaContext, raw: unknown): { records: Row[] } {
  const input = parseInput(ListRecordsInput, raw);
  const rows = ctx.raw
    .prepare(
      `SELECT r.key, r.kind, r.title, r.latest_rev, r.confirmed_rev, r.withdrawn,
              rev.status, rev.confidence, rev.not_observable
       FROM doc_records r
       JOIN doc_revisions rev ON rev.record_id = r.id AND rev.rev_no = r.latest_rev
       WHERE r.portal_id = ?
         AND (? IS NULL OR r.kind = ?)
         AND (? IS NULL OR rev.status = ?)
         AND (? = 1 OR r.withdrawn = 0)
       ORDER BY r.kind, r.seq`,
    )
    .all(
      input.portal_id,
      input.kind ?? null,
      input.kind ?? null,
      input.status ?? null,
      input.status ?? null,
      input.include_withdrawn ? 1 : 0,
    ) as Row[];
  return {
    records: rows.map((r) => ({
      ...r,
      withdrawn: r.withdrawn === 1,
      not_observable: r.not_observable === 1,
    })),
  };
}

export const GetRecordInput = z
  .object({ portal_id: z.string().min(1), key: z.string().min(1) })
  .strict();

/** A record with every revision (content, evidence links, relations, status) and every review. */
export function getRecord(ctx: BaContext, raw: unknown): Row {
  const input = parseInput(GetRecordInput, raw);
  const record = ctx.raw
    .prepare('SELECT * FROM doc_records WHERE portal_id = ? AND key = ?')
    .get(input.portal_id, input.key) as Row | undefined;
  if (!record)
    throw new ToolError('RECORD_NOT_FOUND', `no record ${input.key} in portal ${input.portal_id}`, {
      key: input.key,
    });

  const links = ctx.raw.prepare(
    'SELECT target_kind, target_id, run_id, note FROM doc_evidence_links WHERE revision_id = ? ORDER BY id',
  );
  const relations = ctx.raw.prepare(
    `SELECT l.type, r.key AS to_key, r.kind AS to_kind, r.title AS to_title
     FROM doc_relations l JOIN doc_records r ON r.id = l.to_record_id
     WHERE l.from_revision_id = ? ORDER BY l.type, r.key`,
  );
  const reviews = ctx.raw.prepare(
    `SELECT id AS review_id, action, reviewer, text, created_at FROM doc_reviews
     WHERE revision_id = ? ORDER BY created_at, id`,
  );
  const revisions = (
    ctx.raw
      .prepare('SELECT * FROM doc_revisions WHERE record_id = ? ORDER BY rev_no')
      .all(record.id) as Row[]
  ).map((rev) => ({
    rev_no: rev.rev_no,
    change: rev.change,
    status: rev.status,
    confidence: rev.confidence,
    not_observable: rev.not_observable === 1,
    content: json(rev.content_json as string),
    change_note: rev.change_note,
    responds_to_review: rev.responds_to_review,
    session_id: rev.session_id,
    created_at: rev.created_at,
    evidence: links.all(rev.id),
    relations: relations.all(rev.id),
    reviews: reviews.all(rev.id),
  }));

  const followup =
    record.kind === 'followup'
      ? (ctx.raw
          .prepare(
            'SELECT status, run_id, blocked_reason, updated_at FROM followup_tasks WHERE record_id = ?',
          )
          .get(record.id) ?? null)
      : undefined;
  // Who points at this record (from the latest revision of each source).
  const relatedFrom = ctx.raw
    .prepare(
      `SELECT l.type, r.key AS from_key, r.kind AS from_kind, r.title AS from_title
       FROM doc_relations l
       JOIN doc_revisions rev ON rev.id = l.from_revision_id
       JOIN doc_records r ON r.id = rev.record_id AND r.latest_rev = rev.rev_no
       WHERE l.to_record_id = ? ORDER BY l.type, r.key`,
    )
    .all(record.id);

  return {
    record_id: record.id,
    portal_id: record.portal_id,
    key: record.key,
    kind: record.kind,
    title: record.title,
    latest_rev: record.latest_rev,
    confirmed_rev: record.confirmed_rev,
    withdrawn: record.withdrawn === 1,
    ...(followup !== undefined ? { followup } : {}),
    revisions,
    related_from: relatedFrom,
  };
}

// ---------------------------------------------------------------------------------------------------
// list_processes, get_process (trace mode)

export const ListProcessesInput = z.object({ portal_id: z.string().min(1) }).strict();

/** The trace processes of a portal, oldest first, one line each. */
export function listProcesses(ctx: BaContext, raw: unknown): { processes: Row[] } {
  const input = parseInput(ListProcessesInput, raw);
  const rows = ctx.raw
    .prepare(
      `SELECT p.id AS process_id, p.run_id, p.name, p.goal, p.persona_id, p.outcome,
              (SELECT COUNT(*) FROM process_steps s WHERE s.process_id = p.id) AS step_count,
              p.boundary_action_id
       FROM processes p WHERE p.portal_id = ? ORDER BY p.run_id`,
    )
    .all(input.portal_id) as Row[];
  return { processes: rows };
}

export const GetProcessInput = z.object({ process_id: z.string().min(1) }).strict();

/** A state reduced to what a process step needs to name it. */
function stateRef(ctx: BaContext, stateId: unknown): Row | null {
  if (typeof stateId !== 'string') return null;
  const s = ctx.raw
    .prepare('SELECT id, title, route_template FROM states WHERE id = ?')
    .get(stateId) as Row | undefined;
  return s ? { state_id: s.id, title: s.title, route_template: s.route_template } : null;
}

/** One process with its ordered steps and, when a production trace stopped early, its boundary. */
export function getProcess(ctx: BaContext, raw: unknown): Row {
  const input = parseInput(GetProcessInput, raw);
  const p = ctx.raw.prepare('SELECT * FROM processes WHERE id = ?').get(input.process_id) as
    Row | undefined;
  if (!p)
    throw new ToolError('UNKNOWN_REF', `no process with id ${input.process_id}`, {
      process_id: input.process_id,
    });

  const calls = ctx.raw.prepare(
    `SELECT id, method, url_template, status FROM network_calls WHERE edge_id = ? ORDER BY id`,
  );
  const steps = (
    ctx.raw
      .prepare(
        `SELECT s.*, a.role AS action_role, a.accessible_name AS action_name
         FROM process_steps s LEFT JOIN actions a ON a.id = s.action_id
         WHERE s.process_id = ? ORDER BY s.ord`,
      )
      .all(p.id) as Row[]
  ).map((s) => ({
    step_id: s.id,
    ord: s.ord,
    intent: s.intent,
    kind: s.kind,
    action: s.action_id === null ? null : { role: s.action_role, name: s.action_name },
    value: s.value,
    state_before: stateRef(ctx, s.state_before),
    state_after: stateRef(ctx, s.state_after),
    edge_id: s.edge_id,
    network_calls: s.edge_id === null ? [] : calls.all(s.edge_id),
    outcomes: json<string[]>(s.outcomes_json as string),
    evidence_ref: s.evidence_ref,
    confidence: s.confidence,
  }));

  let boundary: Row | null = null;
  if (p.boundary_action_id !== null) {
    const a = ctx.raw
      .prepare(
        'SELECT id, role, accessible_name, safety_class, skip_reason FROM actions WHERE id = ?',
      )
      .get(p.boundary_action_id) as Row | undefined;
    boundary = {
      action_id: p.boundary_action_id,
      role: a?.role ?? null,
      name: a?.accessible_name ?? null,
      safety_class: a?.safety_class ?? null,
      skip_reason: a?.skip_reason ?? null,
      not_observable: p.not_observable,
    };
  }

  return {
    process_id: p.id,
    run_id: p.run_id,
    portal_id: p.portal_id,
    persona_id: p.persona_id,
    name: p.name,
    goal: p.goal,
    status: p.status,
    outcome: p.outcome,
    observed_result: p.observed_result,
    boundary,
    followup_record_id: p.followup_record_id,
    steps,
  };
}
