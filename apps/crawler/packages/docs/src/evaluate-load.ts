/** The evaluator's input read from the store (`docs:evaluate`, `apps/crawler/evals/`). */
import type { Confidence } from '@mudpuppy/core';
import type { DocKind, EvidenceTargetKind } from '@mudpuppy/docs-model';
import type { EvalRecord } from './evaluate.js';
import type { RawDb } from './keys.js';

interface RevisionRow {
  record_id: string;
  key: string;
  kind: DocKind;
  revision_id: string;
  rev_no: number;
  confidence: Confidence;
  not_observable: 0 | 1;
  content_json: string;
}

type Row = Record<string, string | null> | undefined;

/** Reads the route templates an evidence target was seen on. */
interface RouteReader {
  raw: RawDb;
  /** The route template of a state, none for no state. */
  state: (id: string | null | undefined) => string[];
  one: (sql: string, id: string) => Row;
}

const bothEnds = (r: RouteReader, e: Row): string[] =>
  e ? [...r.state(e.from_state), ...r.state(e.to_state)] : [];
const beforeAfter = (r: RouteReader, s: Row): string[] =>
  s ? [...r.state(s.state_before), ...r.state(s.state_after)] : [];

/** How each evidence target kind reaches its routes; other kinds have none. */
const ROUTES_OF: Partial<Record<EvidenceTargetKind, (r: RouteReader, id: string) => string[]>> = {
  state: (r, id) => r.state(id),
  // target_id is the state; the element key is in `region`
  screen_region: (r, id) => r.state(id),
  observation: (r, id) =>
    r.state(r.one('SELECT state_id FROM observations WHERE id = ?', id)?.state_id ?? null),
  form: (r, id) => r.state(r.one('SELECT state_id FROM forms WHERE id = ?', id)?.state_id ?? null),
  action: (r, id) =>
    r.state(r.one('SELECT state_id FROM actions WHERE id = ?', id)?.state_id ?? null),
  transition: (r, id) =>
    bothEnds(r, r.one('SELECT from_state, to_state FROM transitions WHERE id = ?', id)),
  network_call: (r, id) =>
    bothEnds(
      r,
      r.one(
        'SELECT e.from_state, e.to_state FROM network_calls n JOIN transitions e ON e.id = n.transition_id WHERE n.id = ?',
        id,
      ),
    ),
  open_question: (r, id) =>
    r.state(
      r.one(
        'SELECT r.state_id FROM open_questions q JOIN entity_refs r ON r.id = q.ref_id WHERE q.id = ?',
        id,
      )?.state_id ?? null,
    ),
  process: (r, id) =>
    (
      r.raw
        .prepare(
          'SELECT state_before, state_after FROM process_steps WHERE process_id = ? ORDER BY ord',
        )
        .all(id) as { state_before: string | null; state_after: string | null }[]
    ).flatMap((s) => beforeAfter(r, s)),
  process_step: (r, id) =>
    beforeAfter(r, r.one('SELECT state_before, state_after FROM process_steps WHERE id = ?', id)),
};

function routeReader(raw: RawDb): RouteReader {
  return {
    raw,
    state: (id) => {
      if (!id) return [];
      const row = raw.prepare('SELECT route_template FROM states WHERE id = ?').get(id) as
        { route_template: string } | undefined;
      return row ? [row.route_template] : [];
    },
    one: (sql, id) => raw.prepare(sql).get(id) as Row,
  };
}

/** Per non-withdrawn record, its latest revision that is not rejected. */
function latestRevisions(raw: RawDb, portalId: string): RevisionRow[] {
  const rows = raw
    .prepare(
      `SELECT r.id AS record_id, r.key, r.kind, v.id AS revision_id, v.rev_no, v.confidence,
              v.not_observable, v.content_json
       FROM doc_records r JOIN doc_revisions v ON v.record_id = r.id
       WHERE r.portal_id = ? AND r.withdrawn = 0 AND v.status <> 'rejected'
       ORDER BY r.key, v.rev_no`,
    )
    .all(portalId) as RevisionRow[];
  const latest = new Map<string, RevisionRow>();
  for (const row of rows) latest.set(row.record_id, row); // ordered by rev_no: the last one wins
  return [...latest.values()];
}

function recordOf(raw: RawDb, reader: RouteReader, row: RevisionRow): EvalRecord {
  const links = raw
    .prepare(
      'SELECT target_kind, target_id FROM doc_evidence WHERE revision_id = ? ORDER BY target_kind, target_id, id',
    )
    .all(row.revision_id) as { target_kind: EvidenceTargetKind; target_id: string }[];
  let content: Record<string, unknown> = {};
  try {
    content = JSON.parse(row.content_json) as Record<string, unknown>;
  } catch {
    // A malformed revision scores nothing; docs:audit reports it.
  }
  return {
    key: row.key,
    kind: row.kind,
    rev: row.rev_no,
    confidence: row.confidence,
    not_observable: row.not_observable === 1,
    content,
    evidence: links.map((l) => ({
      ...l,
      routes: [...new Set(ROUTES_OF[l.target_kind]?.(reader, l.target_id) ?? [])].sort(),
    })),
  };
}

/** The latest revision or review of the portal's documentation. */
function asOfOf(raw: RawDb, portalId: string): string {
  const asOf = raw
    .prepare(
      `SELECT max(t) AS t FROM (
         SELECT v.created_at AS t FROM doc_revisions v JOIN doc_records r ON r.id = v.record_id WHERE r.portal_id = ?
         UNION ALL
         SELECT rv.created_at FROM doc_reviews rv JOIN doc_revisions v ON v.id = rv.revision_id
         JOIN doc_records r ON r.id = v.record_id WHERE r.portal_id = ?)`,
    )
    .get(portalId, portalId) as { t: string | null };
  return asOf.t ?? '';
}

/** Hand-offs (spec 009 FR-022): the crawler's "Human needed: CAPTCHA on …" questions, by route. */
function handoffsOf(raw: RawDb, portalId: string): string[] {
  return (
    raw
      .prepare(
        `SELECT DISTINCT s.route_template AS route FROM open_questions q
         JOIN runs ru ON ru.id = q.run_id JOIN entity_refs er ON er.id = q.ref_id
         JOIN states s ON s.id = er.state_id
         WHERE ru.portal_id = ? AND q.text LIKE 'Human needed: CAPTCHA on %'
         ORDER BY route`,
      )
      .all(portalId) as { route: string }[]
  ).map((r) => r.route);
}

/**
 * Read the evaluator input from the store: per non-withdrawn record its latest revision that is not
 * rejected, with every evidence link resolved to the route templates it was seen on.
 */
export function loadEvalInput(
  raw: RawDb,
  portalId: string,
): { as_of: string; records: EvalRecord[]; handoffs: string[] } {
  const reader = routeReader(raw);
  const records = latestRevisions(raw, portalId).map((row) => recordOf(raw, reader, row));
  return { as_of: asOfOf(raw, portalId), records, handoffs: handoffsOf(raw, portalId) };
}
