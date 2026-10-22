/**
 * The SRS export's one read of the store (contracts/srs-export.md): `loadExportModel` reads a
 * portal's documentation into the `ExportModel` the chapters render (selection rules in
 * `model.ts`). Read-only; deterministic for a given store. Labels in `export-labels.ts`, pictures
 * in `export-pictures.ts`.
 */
import type { Confidence } from '@mudpuppy/core';
import type {
  DocKind,
  EvidenceTargetKind,
  RelationType,
  RevisionChange,
  RevisionStatus,
} from '@mudpuppy/docs-model';
import type { RawDb } from '../keys.js';
import { json, labelsOf, screenNavInput, sightingLabels } from './export-labels.js';
import { visualsOf, type Pictures } from './export-pictures.js';
import {
  KIND_ORDER,
  type ChangeLogEntry,
  type CrawlerQuestion,
  type ExportEvidence,
  type ExportFollowup,
  type ExportMode,
  type ExportModel,
  type ExportRecord,
  type ExportRelation,
  type ExportReview,
  type ExportRevisionEntry,
  type ExportRun,
} from './model.js';
import { screenUrls } from './screen-urls.js';

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
type RunRow = Omit<ExportRun, 'date'> & { started_at: string };
type Selected = Map<string, { record: RecordRow; shown: RevisionRow; baseline: number | null }>;

/** What the record builders read: the store, the selection and the indexes over it. */
interface Loaded extends Pictures {
  keyOfRecord: ReadonlyMap<string, string>;
  renderedIds: ReadonlySet<string>;
  changeLogKeys: ReadonlySet<string>;
  reviewsByRevision: ReadonlyMap<string, ExportReview[]>;
  links: readonly LinkRow[];
  labels: ReadonlyMap<string, string>;
  runById: ReadonlyMap<string, RunRow>;
}

function cmp(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

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

function groupBy<T, V>(items: readonly T[], key: (t: T) => string, value: (t: T) => V) {
  const out = new Map<string, V[]>();
  for (const item of items) {
    const list = out.get(key(item)) ?? [];
    list.push(value(item));
    out.set(key(item), list);
  }
  return out;
}

/** Records, their revisions and the reviews of those, for one portal. */
function readDocumentation(raw: RawDb, portalId: string) {
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
  return { records, revisions, reviews };
}

/** Change log: "all" lists every record; "confirmed" lists only revisions a reviewer confirmed. */
function changeLogOf(
  records: readonly RecordRow[],
  revsByRecord: ReadonlyMap<string, RevisionRow[]>,
  reviewsByRevision: ReadonlyMap<string, ExportReview[]>,
  { mode, renderedIds }: { mode: ExportMode; renderedIds: ReadonlySet<string> },
): ChangeLogEntry[] {
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
      mode === 'all'
        ? entries
        : entries.filter((e) => e.reviews.some((r) => r.action === 'confirm'));
    if (kept.length === 0) continue;
    if (mode === 'confirmed' && !renderedIds.has(record.id)) continue;
    changeLog.push({
      key: record.key,
      kind: record.kind,
      title: record.title,
      withdrawn: record.withdrawn === 1,
      excluded: renderedIds.has(record.id) ? null : record.withdrawn ? 'withdrawn' : 'rejected',
      revisions: kept,
    });
  }
  return changeLog;
}

/** Evidence links of the rendered revisions. */
function linksOf(raw: RawDb, shownIds: readonly string[]): LinkRow[] {
  const links: LinkRow[] = [];
  for (const id of shownIds)
    links.push(
      ...(raw
        .prepare(
          `SELECT revision_id, target_kind, target_id, run_id, note, region FROM doc_evidence
           WHERE revision_id = ? ORDER BY target_kind, target_id, region, id`,
        )
        .all(id) as LinkRow[]),
    );
  return links;
}

function evidenceOf(ctx: Loaded, revisionId: string): ExportEvidence[] {
  return ctx.links
    .filter((l) => l.revision_id === revisionId)
    .map((l) => {
      const label = ctx.labels.get(`${l.target_kind}:${l.target_id}`) ?? null;
      const run = l.run_id ? ctx.runById.get(l.run_id) : undefined;
      const docKey =
        l.target_kind === 'doc_record' ? (ctx.keyOfRecord.get(l.target_id) ?? null) : null;
      return {
        target_kind: l.target_kind,
        target_id: l.target_id,
        label,
        run_id: l.run_id,
        run_mode: run?.mode ?? null,
        run_date: run ? run.started_at.slice(0, 10) : null,
        note: l.note,
        doc_key:
          docKey && (ctx.renderedIds.has(l.target_id) || ctx.changeLogKeys.has(docKey))
            ? docKey
            : null,
        region: l.target_kind === 'screen_region' ? l.region : null,
      };
    });
}

function relationsOf(ctx: Loaded, revisionId: string): ExportRelation[] {
  return (
    ctx.raw
      .prepare(`SELECT x.type, x.to_record_id FROM doc_relations x WHERE x.from_revision_id = ?`)
      .all(revisionId) as { type: RelationType; to_record_id: string }[]
  )
    .filter((x) => ctx.renderedIds.has(x.to_record_id))
    .map((x) => ({ type: x.type, to_key: ctx.keyOfRecord.get(x.to_record_id)! }))
    .sort((a, b) => cmp(a.type, b.type) || cmp(a.to_key, b.to_key));
}

function followupOf(raw: RawDb, recordId: string): ExportFollowup | null {
  return (
    (raw
      .prepare('SELECT status, blocked_reason, run_id FROM followup_tasks WHERE record_id = ?')
      .get(recordId) as ExportFollowup | undefined) ?? null
  );
}

/** The trace of one run's process, when the run traced one with steps. */
function processTrace(
  raw: RawDb,
  runId: string,
  record: { key: string; title: string },
): Pick<ExportRecord, 'trace' | 'boundary'> | null {
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
  if (!process) return null;
  const steps = raw
    .prepare('SELECT ord, kind, intent FROM process_steps WHERE process_id = ? ORDER BY ord')
    .all(process.id) as { ord: number; kind: string; intent: string }[];
  if (steps.length === 0) return null;
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
  return { trace: { process: record, steps, boundary }, boundary };
}

function traceOf(
  raw: RawDb,
  record: { key: string; title: string },
  content: Record<string, unknown>,
  evidence: ExportEvidence[],
): Pick<ExportRecord, 'trace' | 'boundary'> {
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
    const found = processTrace(raw, runId, record);
    if (found) return found;
  }
  return { trace: null, boundary: null };
}

function renderRecord(
  ctx: Loaded,
  { record, shown, baseline }: { record: RecordRow; shown: RevisionRow; baseline: number | null },
): ExportRecord {
  const content = (json(shown.content_json) ?? {}) as Record<string, unknown>;
  const title = typeof content.title === 'string' ? content.title : record.title;
  const evidence = evidenceOf(ctx, shown.id);
  return {
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
    relations: relationsOf(ctx, shown.id),
    reviews: ctx.reviewsByRevision.get(shown.id) ?? [],
    followup: record.kind === 'followup' ? followupOf(ctx.raw, record.id) : null,
    ...(record.kind === 'process'
      ? traceOf(ctx.raw, { key: record.key, title }, content, evidence)
      : { trace: null, boundary: null }),
    visuals: visualsOf(ctx, evidence),
  };
}

function sessionRunsOf(raw: RawDb, portalId: string): Set<string> {
  return new Set(
    (
      raw
        .prepare(
          `SELECT DISTINCT sr.run_id FROM analysis_session_runs sr
           JOIN analysis_sessions s ON s.id = sr.session_id WHERE s.portal_id = ?`,
        )
        .all(portalId) as { run_id: string }[]
    ).map((r) => r.run_id),
  );
}

function crawlerQuestionsOf(raw: RawDb, portalId: string): CrawlerQuestion[] {
  return raw
    .prepare(
      `SELECT q.id, q.run_id, q.text FROM open_questions q JOIN runs r ON r.id = q.run_id
       WHERE r.portal_id = ? AND q.status = 'open' ORDER BY q.id`,
    )
    .all(portalId) as CrawlerQuestion[];
}

/** Decide what is rendered first: relations and doc_record evidence only name rendered records. */
function selectRecords(
  records: readonly RecordRow[],
  revsByRecord: ReadonlyMap<string, RevisionRow[]>,
  mode: ExportMode,
): Selected {
  const selected: Selected = new Map();
  for (const record of records) {
    const pick = selectRevision(record, revsByRecord.get(record.id) ?? [], mode);
    if (pick) selected.set(record.id, { record, ...pick });
  }
  return selected;
}

/** Read one portal's documentation for the export. Read-only; deterministic for a given store. */
export function loadExportModel(
  raw: RawDb,
  portalId: string,
  /** `evidenceRoot`: where layouts are read from, for region boxes (spec 008); optional. */
  opts: { environment: string; mode: ExportMode; evidenceRoot?: string },
): ExportModel {
  const { records, revisions, reviews } = readDocumentation(raw, portalId);
  const revsByRecord = groupBy(
    revisions,
    (v) => v.record_id,
    (v) => v,
  );
  const reviewsByRevision = new Map<string, ExportReview[]>();
  for (const { revision_id, ...review } of reviews) {
    const list = reviewsByRevision.get(revision_id) ?? [];
    list.push(review);
    reviewsByRevision.set(revision_id, list);
  }
  const asOf = [...revisions.map((v) => v.created_at), ...reviews.map((r) => r.created_at)]
    .sort(cmp)
    .at(-1);
  const selected = selectRecords(records, revsByRecord, opts.mode);
  const renderedIds = new Set(selected.keys());
  const changeLog = changeLogOf(records, revsByRecord, reviewsByRevision, {
    mode: opts.mode,
    renderedIds,
  });
  const links = linksOf(
    raw,
    [...selected.values()].map((s) => s.shown.id),
  );
  const runRows = raw
    .prepare(
      `SELECT id, mode, environment, persona_id, status, started_at FROM runs WHERE portal_id = ? ORDER BY id`,
    )
    .all(portalId) as RunRow[];
  const ctx: Loaded = {
    raw,
    evidenceRoot: opts.evidenceRoot,
    screenCache: new Map(),
    keyOfRecord: new Map(records.map((r) => [r.id, r.key])),
    renderedIds,
    changeLogKeys: new Set(changeLog.map((c) => c.key)),
    reviewsByRevision,
    links,
    labels: labelsOf(raw, links),
    runById: new Map(runRows.map((r) => [r.id, r])),
  };
  const rendered = [...selected.values()].map((s) => renderRecord(ctx, s));
  rendered.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.seq - b.seq);
  // Stable sort: within a kind the rows keep the query's seq order.
  changeLog.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const sessionRuns = sessionRunsOf(raw, portalId);
  const runs = runRows
    .filter((r) => sessionRuns.has(r.id))
    .map(({ started_at, ...r }) => ({ ...r, date: started_at.slice(0, 10) }));
  return {
    portal_id: portalId,
    environment: opts.environment,
    mode: opts.mode,
    as_of: asOf ?? '',
    records: rendered,
    change_log: changeLog,
    runs,
    crawler_questions: crawlerQuestionsOf(raw, portalId),
    screen_nav: screenNavInput(raw, rendered, selected),
    sightings: sightingLabels(raw, rendered),
    screen_urls: screenUrls(raw, rendered, sessionRuns),
  };
}
