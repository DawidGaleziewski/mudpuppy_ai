import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Layout, isEvidenceRef, type Confidence } from '@pathfinder/core';
import type {
  DocKind,
  EvidenceTargetKind,
  RelationType,
  ReviewAction,
  RevisionChange,
  RevisionStatus,
} from '@pathfinder/docs-model';
import type { RawDb } from '../keys.js';
import type { ProcessMapInput, ScreenNavInput } from './mermaid.js';
import type { ExportAmendment } from './amendments.js';

/**
 * Everything the SRS export renders, read once from the store (contracts/srs-export.md). The
 * chapters are pure functions of this model; only `loadExportModel` touches the database.
 *
 * Selection (which revision a record is rendered with):
 * - "all": the latest revision when it is `draft` or `confirmed`; a newer draft over a confirmed
 *   revision carries `baseline_rev`. A latest `rejected` revision falls back to the confirmed one
 *   if there is one, else the record is not rendered. Withdrawn records are never rendered.
 * - "confirmed": the confirmed revision (`doc_records.confirmed_rev`), else not rendered.
 * Records that are not rendered appear only in the change log ("all" mode), so the export never
 * shows a claim a reviewer turned down.
 */

export type ExportMode = 'all' | 'confirmed';

export interface ExportReview {
  action: ReviewAction;
  reviewer: string;
  text: string | null;
  created_at: string;
}

export interface ExportRevisionEntry {
  rev: number;
  change: RevisionChange;
  status: RevisionStatus;
  confidence: Confidence;
  not_observable: boolean;
  change_note: string | null;
  created_at: string;
  reviews: ExportReview[];
}

export interface ExportEvidence {
  target_kind: EvidenceTargetKind;
  target_id: string;
  /** Short human label of the target (no evidence file content), null when broken. */
  label: string | null;
  run_id: string | null;
  run_mode: string | null;
  /** `YYYY-MM-DD` of the run's start. */
  run_date: string | null;
  note: string | null;
  /** The target row no longer exists. */
  broken: boolean;
  /** For a `doc_record` target: its key, when that record is part of the export. */
  doc_key: string | null;
  /** For a `screen_region` target: the cited element key (spec 008). */
  region: string | null;
}

/** A state a record cites (as a state or a region), with its pictures (spec 008 US4). */
export interface ExportScreen {
  state_id: string;
  title: string;
  route_template: string;
  /** Evidence refs; null when the state has none. */
  screenshot_ref: string | null;
  wireframe_svg_ref: string | null;
  wireframe_excalidraw_ref: string | null;
  /** Screenshot size from the layout; null without a layout or without `evidenceRoot`. */
  page: { width: number; height: number } | null;
}

export interface ExportRegion {
  state_id: string;
  key: string;
  note: string | null;
  /** Page-coordinate box from the layout; null when the element is not on the screenshot. */
  box: { x: number; y: number; width: number; height: number } | null;
}

export interface ExportRelation {
  type: RelationType;
  to_key: string;
}

export interface ExportFollowup {
  status: 'open' | 'in_progress' | 'done' | 'blocked' | 'cancelled';
  blocked_reason: string | null;
  run_id: string | null;
}

export interface ExportRecord {
  key: string;
  kind: DocKind;
  seq: number;
  title: string;
  rev: number;
  /** `draft` or `confirmed`: the status of the rendered revision. */
  status: 'draft' | 'confirmed';
  confidence: Confidence;
  not_observable: boolean;
  /** Set when a newer draft is rendered over a confirmed revision. */
  baseline_rev: number | null;
  content: Record<string, unknown>;
  evidence: ExportEvidence[];
  /** Outgoing relations to records that are part of the export. */
  relations: ExportRelation[];
  reviews: ExportReview[];
  followup: ExportFollowup | null;
  /** Process map of the trace the record cites (process records only). */
  trace: ProcessMapInput | null;
  /** The trace's boundary, for the Unknowns chapter. */
  boundary: { action: string; not_observable: string } | null;
  /** Cited states in link order (deduplicated) and the cited screen regions (spec 008). */
  visuals: { screens: ExportScreen[]; regions: ExportRegion[] };
}

export interface ChangeLogEntry {
  key: string;
  kind: DocKind;
  title: string;
  withdrawn: boolean;
  /** Why it is in the change log only, or null when it is also rendered. */
  excluded: 'rejected' | 'withdrawn' | null;
  revisions: ExportRevisionEntry[];
}

export interface ExportRun {
  id: string;
  mode: string;
  environment: string;
  persona_id: string;
  status: string;
  date: string;
}

export interface CrawlerQuestion {
  id: string;
  run_id: string;
  text: string;
}

export interface ExportModel {
  portal_id: string;
  environment: string;
  mode: ExportMode;
  /** Newest revision or review time in the portal's store; never the wall clock. */
  as_of: string;
  /** Rendered records, ordered by kind order then seq. */
  records: ExportRecord[];
  change_log: ChangeLogEntry[];
  /** Runs read by the portal's analysis sessions, by id. */
  runs: ExportRun[];
  /** Crawler questions still open, by id. */
  crawler_questions: CrawlerQuestion[];
  screen_nav: ScreenNavInput & { omitted: number };
  /** Data item `seen_in` target id → short label (`form on /kontakt`, `GET /api/x`). */
  sightings: Record<string, string>;
  /** Set on a process-scoped export (R-30 FR-016); absent otherwise, so unscoped output is unchanged. */
  scope?: { name: string; state_ids: string[] };
  /** BA to-be amendments (R-30 FR-023); absent when the portal has none (SC-007). */
  amendments?: ExportAmendment[];
}

/** Canonical kind order: the order of the SRS chapters. */
export const KIND_ORDER: readonly DocKind[] = [
  'capability',
  'screen',
  'process',
  'use_case',
  'requirement',
  'business_rule',
  'data_item',
  'glossary_term',
  'nfr',
  'assumption',
  'open_question',
  'followup',
];

interface RecordRow {
  id: string;
  kind: DocKind;
  key: string;
  seq: number;
  title: string;
  latest_rev: number;
  confirmed_rev: number | null;
  withdrawn: 0 | 1;
}
interface RevisionRow {
  id: string;
  record_id: string;
  rev_no: number;
  change: RevisionChange;
  content_json: string;
  confidence: Confidence;
  not_observable: 0 | 1;
  status: RevisionStatus;
  change_note: string | null;
  created_at: string;
}
interface LinkRow {
  revision_id: string;
  target_kind: EvidenceTargetKind;
  target_id: string;
  run_id: string | null;
  note: string | null;
  region: string | null;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A state's layout boxes by element key, read from the evidence store; empty when unreadable. */
function layoutBoxes(evidenceRoot: string | undefined, layoutRef: string | null) {
  const out = new Map<string, ExportRegion['box']>();
  let page: ExportScreen['page'] = null;
  if (!evidenceRoot || !layoutRef || !isEvidenceRef(layoutRef)) return { page, boxes: out };
  try {
    const layout = Layout.parse(JSON.parse(readFileSync(join(evidenceRoot, layoutRef), 'utf8')));
    page = layout.page;
    for (const e of layout.elements) out.set(e.key, e.box);
  } catch {
    // an unreadable layout only means no boxes
  }
  return { page, boxes: out };
}
const json = (text: string | null): unknown => {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
const accessibleName = (actionJson: string | null): string | null => {
  const a = json(actionJson);
  return a && typeof a === 'object' && 'accessible_name' in a ? String(a.accessible_name) : null;
};

/** Labels as the Docs tab shows them (queries_docs.py `_TARGETS`); never evidence file content. */
const TARGET_LABEL: Partial<
  Record<EvidenceTargetKind, { table: string; label: (r: Record<string, unknown>) => string }>
> = {
  state: { table: 'states', label: (r) => `${String(r.title)} (${String(r.route_template)})` },
  screen_region: {
    table: 'states',
    label: (r) => `${String(r.title)} (${String(r.route_template)})`,
  },
  edge: {
    table: 'edges',
    label: (r) => {
      const name = accessibleName(r.action_json as string | null);
      return name ? `edge: "${name}"` : 'edge';
    },
  },
  action: {
    table: 'actions',
    label: (r) => `${String(r.role)} "${String(r.accessible_name ?? '')}"`,
  },
  form: {
    table: 'forms',
    label: (r) => {
      const fields = json(r.fields_json as string);
      const names = Array.isArray(fields)
        ? fields
            .map((f: unknown) => (f && typeof f === 'object' && 'name' in f ? String(f.name) : ''))
            .filter(Boolean)
        : [];
      return `form: ${names.slice(0, 4).join(', ') || 'fields not named'}`;
    },
  },
  network_call: {
    table: 'network_calls',
    label: (r) => `${String(r.method)} ${String(r.url_template)}`,
  },
  rule_candidate: { table: 'rule_candidates', label: (r) => String(r.text) },
  open_question: { table: 'open_questions', label: (r) => String(r.text) },
  decision: {
    table: 'decision_log',
    label: (r) =>
      `${String(r.kind)} ${String(r.rule ?? '')}: ${String(r.reason)}`.replace(/ +/g, ' '),
  },
  process: { table: 'processes', label: (r) => String(r.name) },
  process_step: {
    table: 'process_steps',
    label: (r) => `step ${String(r.ord)}: ${String(r.intent)}`,
  },
};

function selectRevision(
  record: RecordRow,
  revs: RevisionRow[],
  mode: ExportMode,
): { shown: RevisionRow; baseline: number | null } | null {
  if (record.withdrawn) return null;
  const byNo = new Map(revs.map((r) => [r.rev_no, r]));
  const confirmed = record.confirmed_rev !== null ? byNo.get(record.confirmed_rev) : undefined;
  if (mode === 'confirmed') return confirmed ? { shown: confirmed, baseline: null } : null;
  const latest = byNo.get(record.latest_rev);
  if (!latest) return null;
  if (latest.status === 'draft')
    return {
      shown: latest,
      baseline: confirmed && confirmed.rev_no !== latest.rev_no ? confirmed.rev_no : null,
    };
  if (latest.status === 'confirmed') return { shown: latest, baseline: null };
  return confirmed ? { shown: confirmed, baseline: null } : null;
}

/** Read one portal's documentation for the export. Read-only; deterministic for a given store. */
export function loadExportModel(
  raw: RawDb,
  portalId: string,
  /** `evidenceRoot`: where layouts are read from, for region boxes (spec 008); optional. */
  opts: { environment: string; mode: ExportMode; evidenceRoot?: string },
): ExportModel {
  const records = raw
    .prepare(
      `SELECT id, kind, key, seq, title, latest_rev, confirmed_rev, withdrawn FROM doc_records
       WHERE portal_id = ? ORDER BY kind, seq`,
    )
    .all(portalId) as RecordRow[];
  const revisions = raw
    .prepare(
      `SELECT v.id, v.record_id, v.rev_no, v.change, v.content_json, v.confidence, v.not_observable,
              v.status, v.change_note, v.created_at
       FROM doc_revisions v JOIN doc_records r ON r.id = v.record_id
       WHERE r.portal_id = ? ORDER BY v.record_id, v.rev_no`,
    )
    .all(portalId) as RevisionRow[];
  const reviews = raw
    .prepare(
      `SELECT rv.revision_id, rv.action, rv.reviewer, rv.text, rv.created_at
       FROM doc_reviews rv JOIN doc_revisions v ON v.id = rv.revision_id
       JOIN doc_records r ON r.id = v.record_id
       WHERE r.portal_id = ? ORDER BY rv.created_at, rv.id`,
    )
    .all(portalId) as (ExportReview & { revision_id: string })[];

  const revsByRecord = new Map<string, RevisionRow[]>();
  for (const v of revisions) {
    const list = revsByRecord.get(v.record_id) ?? [];
    list.push(v);
    revsByRecord.set(v.record_id, list);
  }
  const reviewsByRevision = new Map<string, ExportReview[]>();
  for (const { revision_id, ...review } of reviews) {
    const list = reviewsByRevision.get(revision_id) ?? [];
    list.push(review);
    reviewsByRevision.set(revision_id, list);
  }

  const asOf = [...revisions.map((v) => v.created_at), ...reviews.map((r) => r.created_at)]
    .sort(cmp)
    .at(-1);

  // Decide what is rendered first: relations and doc_record evidence only name rendered records.
  const selected = new Map<
    string,
    { record: RecordRow; shown: RevisionRow; baseline: number | null }
  >();
  for (const record of records) {
    const pick = selectRevision(record, revsByRecord.get(record.id) ?? [], opts.mode);
    if (pick) selected.set(record.id, { record, ...pick });
  }
  const keyOfRecord = new Map(records.map((r) => [r.id, r.key]));
  const renderedIds = new Set(selected.keys());

  // Change log: "all" lists every record; "confirmed" lists only revisions a reviewer confirmed.
  const changeLog: ChangeLogEntry[] = [];
  for (const record of records) {
    const entries = (revsByRecord.get(record.id) ?? []).map((v): ExportRevisionEntry => ({
      rev: v.rev_no,
      change: v.change,
      status: v.status,
      confidence: v.confidence,
      not_observable: v.not_observable === 1,
      change_note: v.change_note,
      created_at: v.created_at,
      reviews: reviewsByRevision.get(v.id) ?? [],
    }));
    const kept =
      opts.mode === 'all'
        ? entries
        : entries.filter((e) => e.reviews.some((r) => r.action === 'confirm'));
    if (kept.length === 0) continue;
    if (opts.mode === 'confirmed' && !renderedIds.has(record.id)) continue;
    changeLog.push({
      key: record.key,
      kind: record.kind,
      title: record.title,
      withdrawn: record.withdrawn === 1,
      excluded: renderedIds.has(record.id) ? null : record.withdrawn ? 'withdrawn' : 'rejected',
      revisions: kept,
    });
  }
  const changeLogKeys = new Set(changeLog.map((c) => c.key));

  // Evidence of the rendered revisions.
  const shownIds = [...selected.values()].map((s) => s.shown.id);
  const links: LinkRow[] = [];
  for (const id of shownIds)
    links.push(
      ...(raw
        .prepare(
          `SELECT revision_id, target_kind, target_id, run_id, note, region FROM doc_evidence_links
           WHERE revision_id = ? ORDER BY target_kind, target_id, region, id`,
        )
        .all(id) as LinkRow[]),
    );
  const labels = new Map<string, string>();
  for (const kind of new Set(links.map((l) => l.target_kind))) {
    const spec = TARGET_LABEL[kind];
    const ids = [...new Set(links.filter((l) => l.target_kind === kind).map((l) => l.target_id))];
    for (const id of ids) {
      if (spec) {
        const row = raw.prepare(`SELECT * FROM ${spec.table} WHERE id = ?`).get(id) as
          Record<string, unknown> | undefined;
        if (row) labels.set(`${kind}:${id}`, spec.label(row));
      } else if (kind === 'doc_record') {
        const row = raw.prepare('SELECT key, title FROM doc_records WHERE id = ?').get(id) as
          { key: string; title: string } | undefined;
        if (row) labels.set(`${kind}:${id}`, row.title);
      } else if (kind === 'review') {
        const row = raw.prepare('SELECT action, reviewer FROM doc_reviews WHERE id = ?').get(id) as
          { action: string; reviewer: string } | undefined;
        if (row) labels.set(`${kind}:${id}`, `review (${row.action}) by ${row.reviewer}`);
      }
    }
  }
  const runRows = raw
    .prepare(
      `SELECT id, mode, environment, persona_id, status, started_at FROM runs WHERE portal_id = ? ORDER BY id`,
    )
    .all(portalId) as (Omit<ExportRun, 'date'> & { started_at: string })[];
  const runById = new Map(runRows.map((r) => [r.id, r]));
  const evidenceOf = (revisionId: string): ExportEvidence[] =>
    links
      .filter((l) => l.revision_id === revisionId)
      .map((l) => {
        const label = labels.get(`${l.target_kind}:${l.target_id}`) ?? null;
        const run = l.run_id ? runById.get(l.run_id) : undefined;
        const docKey =
          l.target_kind === 'doc_record' ? (keyOfRecord.get(l.target_id) ?? null) : null;
        return {
          target_kind: l.target_kind,
          target_id: l.target_id,
          label,
          run_id: l.run_id,
          run_mode: run?.mode ?? null,
          run_date: run ? run.started_at.slice(0, 10) : null,
          note: l.note,
          broken: label === null,
          doc_key:
            docKey && (renderedIds.has(l.target_id) || changeLogKeys.has(docKey)) ? docKey : null,
          region: l.target_kind === 'screen_region' ? l.region : null,
        };
      });

  // Pictures of the cited states (spec 008 US4): one entry per state, in link order.
  const screenCache = new Map<
    string,
    { screen: ExportScreen; boxes: Map<string, ExportRegion['box']> } | null
  >();
  const screenOf = (stateId: string) => {
    if (screenCache.has(stateId)) return screenCache.get(stateId)!;
    const row = raw
      .prepare(
        `SELECT s.title, s.route_template, s.screenshot_ref, s.layout_ref,
                w.svg_ref, w.excalidraw_ref
         FROM states s LEFT JOIN state_wireframes w ON w.state_id = s.id WHERE s.id = ?`,
      )
      .get(stateId) as
      | {
          title: string;
          route_template: string;
          screenshot_ref: string | null;
          layout_ref: string | null;
          svg_ref: string | null;
          excalidraw_ref: string | null;
        }
      | undefined;
    // A picture is exported only when its file is there, so no image link can dangle.
    const present = (ref: string | null): string | null =>
      ref && opts.evidenceRoot && isEvidenceRef(ref) && existsSync(join(opts.evidenceRoot, ref))
        ? ref
        : null;
    const value = row
      ? (() => {
          const { page, boxes } = layoutBoxes(opts.evidenceRoot, row.layout_ref);
          return {
            screen: {
              state_id: stateId,
              title: row.title,
              route_template: row.route_template,
              screenshot_ref: present(row.screenshot_ref),
              wireframe_svg_ref: present(row.svg_ref),
              wireframe_excalidraw_ref: present(row.excalidraw_ref),
              page,
            },
            boxes,
          };
        })()
      : null;
    screenCache.set(stateId, value);
    return value;
  };
  const visualsOf = (evidence: readonly ExportEvidence[]): ExportRecord['visuals'] => {
    const screens: ExportScreen[] = [];
    const regions: ExportRegion[] = [];
    for (const e of evidence) {
      if ((e.target_kind !== 'state' && e.target_kind !== 'screen_region') || e.broken) continue;
      const s = screenOf(e.target_id);
      if (!s) continue;
      if (!screens.some((x) => x.state_id === e.target_id)) screens.push(s.screen);
      if (e.target_kind === 'screen_region' && e.region)
        regions.push({
          state_id: e.target_id,
          key: e.region,
          note: e.note,
          box: s.boxes.get(e.region) ?? null,
        });
    }
    return { screens, regions };
  };

  const relationsOf = (revisionId: string): ExportRelation[] =>
    (
      raw
        .prepare(`SELECT x.type, x.to_record_id FROM doc_relations x WHERE x.from_revision_id = ?`)
        .all(revisionId) as { type: RelationType; to_record_id: string }[]
    )
      .filter((x) => renderedIds.has(x.to_record_id))
      .map((x) => ({ type: x.type, to_key: keyOfRecord.get(x.to_record_id)! }))
      .sort((a, b) => cmp(a.type, b.type) || cmp(a.to_key, b.to_key));

  const followupOf = (recordId: string): ExportFollowup | null =>
    (raw
      .prepare('SELECT status, blocked_reason, run_id FROM followup_tasks WHERE record_id = ?')
      .get(recordId) as ExportFollowup | undefined) ?? null;

  const traceOf = (
    key: string,
    title: string,
    content: Record<string, unknown>,
    evidence: ExportEvidence[],
  ): Pick<ExportRecord, 'trace' | 'boundary'> => {
    if (content.observed_extent === 'map_only') return { trace: null, boundary: null };
    const runIds = [
      ...new Set(
        evidence
          .filter((e) => e.target_kind === 'process' || e.target_kind === 'process_step')
          .map((e) => e.run_id)
          .filter((r): r is string => r !== null),
      ),
    ];
    for (const runId of runIds) {
      const process = raw
        .prepare(
          'SELECT id, outcome, boundary_action_id, not_observable FROM processes WHERE run_id = ?',
        )
        .get(runId) as
        | {
            id: string;
            outcome: string | null;
            boundary_action_id: string | null;
            not_observable: string | null;
          }
        | undefined;
      if (!process) continue;
      const steps = raw
        .prepare('SELECT ord, kind, intent FROM process_steps WHERE process_id = ? ORDER BY ord')
        .all(process.id) as { ord: number; kind: string; intent: string }[];
      if (steps.length === 0) continue;
      let boundary: ExportRecord['boundary'] = null;
      if (process.outcome === 'boundary_reached' && process.boundary_action_id) {
        const a = raw
          .prepare('SELECT role, accessible_name FROM actions WHERE id = ?')
          .get(process.boundary_action_id) as
          { role: string; accessible_name: string | null } | undefined;
        boundary = {
          action: a ? `${a.role} "${a.accessible_name ?? ''}"` : 'boundary',
          not_observable: process.not_observable ?? 'not observable',
        };
      }
      return { trace: { process: { key, title }, steps, boundary }, boundary };
    }
    return { trace: null, boundary: null };
  };

  const rendered: ExportRecord[] = [];
  for (const { record, shown, baseline } of selected.values()) {
    const content = (json(shown.content_json) ?? {}) as Record<string, unknown>;
    const title = typeof content.title === 'string' ? content.title : record.title;
    const evidence = evidenceOf(shown.id);
    rendered.push({
      key: record.key,
      kind: record.kind,
      seq: record.seq,
      title,
      rev: shown.rev_no,
      status: shown.status === 'confirmed' ? 'confirmed' : 'draft',
      confidence: shown.confidence,
      not_observable: shown.not_observable === 1,
      baseline_rev: baseline,
      content,
      evidence,
      relations: relationsOf(shown.id),
      reviews: reviewsByRevision.get(shown.id) ?? [],
      followup: record.kind === 'followup' ? followupOf(record.id) : null,
      ...(record.kind === 'process'
        ? traceOf(record.key, title, content, evidence)
        : { trace: null, boundary: null }),
      visuals: visualsOf(evidence),
    });
  }
  rendered.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.seq - b.seq);
  // Stable sort: within a kind the rows keep the query's seq order.
  changeLog.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));

  const sessionRuns = new Set(
    (
      raw
        .prepare(
          `SELECT DISTINCT sr.run_id FROM analysis_session_runs sr
           JOIN analysis_sessions s ON s.id = sr.session_id WHERE s.portal_id = ?`,
        )
        .all(portalId) as { run_id: string }[]
    ).map((r) => r.run_id),
  );
  const runs = runRows
    .filter((r) => sessionRuns.has(r.id))
    .map(({ started_at, ...r }) => ({ ...r, date: started_at.slice(0, 10) }));

  const crawlerQuestions = raw
    .prepare(
      `SELECT q.id, q.run_id, q.text FROM open_questions q JOIN runs r ON r.id = q.run_id
       WHERE r.portal_id = ? AND q.status = 'open' ORDER BY q.id`,
    )
    .all(portalId) as CrawlerQuestion[];

  return {
    portal_id: portalId,
    environment: opts.environment,
    mode: opts.mode,
    as_of: asOf ?? '',
    records: rendered,
    change_log: changeLog,
    runs,
    crawler_questions: crawlerQuestions,
    screen_nav: screenNavInput(raw, rendered, selected),
    sightings: sightingLabels(raw, rendered),
  };
}

function sightingLabels(raw: RawDb, rendered: ExportRecord[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rendered) {
    if (r.kind !== 'data_item' || !Array.isArray(r.content.seen_in)) continue;
    for (const s of r.content.seen_in as { kind?: string; target_id?: string }[]) {
      if (!s.target_id || out[s.target_id]) continue;
      if (s.kind === 'form') {
        const row = raw
          .prepare(
            'SELECT s.route_template FROM forms f JOIN states s ON s.id = f.state_id WHERE f.id = ?',
          )
          .get(s.target_id) as { route_template: string } | undefined;
        if (row) out[s.target_id] = `form on ${row.route_template}`;
      } else if (s.kind === 'network_call') {
        const row = raw
          .prepare('SELECT method, url_template FROM network_calls WHERE id = ?')
          .get(s.target_id) as { method: string; url_template: string } | undefined;
        if (row) out[s.target_id] = `${row.method} ${row.url_template}`;
      }
    }
  }
  return out;
}

/**
 * Mirror of the dashboard's `screen_diagram_input`: transitions where an edge leads from a state one
 * rendered screen cites to a state another cites; targets reached from more than half the screens
 * (global navigation) are left out and counted.
 */
function screenNavInput(
  raw: RawDb,
  rendered: ExportRecord[],
  selected: Map<string, { record: RecordRow; shown: RevisionRow }>,
): ScreenNavInput & { omitted: number } {
  const screens = rendered.filter((r) => r.kind === 'screen');
  const owner = new Map<string, string>();
  for (const s of [...selected.values()]
    .filter((x) => x.record.kind === 'screen')
    .sort((a, b) => a.record.seq - b.record.seq)) {
    const states = raw
      .prepare(
        `SELECT target_id FROM doc_evidence_links WHERE revision_id = ? AND target_kind = 'state' ORDER BY id`,
      )
      .all(s.shown.id) as { target_id: string }[];
    for (const { target_id } of states)
      if (!owner.has(target_id)) owner.set(target_id, s.record.key);
  }
  const pairs = new Map<string, { from: string; to: string; label: string }>();
  if (owner.size > 0) {
    const ids = [...owner.keys()];
    const marks = ids.map(() => '?').join(',');
    const edges = raw
      .prepare(
        `SELECT from_state, to_state, action_json FROM edges
         WHERE from_state IN (${marks}) AND to_state IN (${marks}) ORDER BY id LIMIT 200`,
      )
      .all(...ids, ...ids) as { from_state: string; to_state: string; action_json: string }[];
    for (const e of edges) {
      const a = owner.get(e.from_state)!;
      const b = owner.get(e.to_state)!;
      const name = accessibleName(e.action_json);
      const k = `${a}\u0000${b}`;
      if (a !== b && name && !pairs.has(k)) pairs.set(k, { from: a, to: b, label: name });
    }
  }
  const sources = new Map<string, Set<string>>();
  for (const p of pairs.values()) sources.set(p.to, (sources.get(p.to) ?? new Set()).add(p.from));
  const global = new Set(
    [...sources]
      .filter(([, s]) => s.size > Math.max(3, Math.floor(screens.length / 2)))
      .map(([to]) => to),
  );
  const kept = [...pairs.values()].filter((p) => !global.has(p.to));
  return {
    screens: screens.map((s) => ({ key: s.key, title: s.title })),
    transitions: kept,
    omitted: pairs.size - kept.length,
  };
}
