/**
 * Typed references (spec 039 design § 15, migration 0040): everything that points at evidence or a
 * model object holds an `entity_refs` row with a real foreign key. The BA still cites by kind and
 * id (`target_kind`, `target_id`, a screen region's `region`); this maps those onto the ref's
 * columns, and the view `doc_evidence` maps them back.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { newId } from '@pathfinder/core';
import type { EvidenceTargetKind } from '@pathfinder/docs-model';

type Raw = BetterSqlite3.Database;

/** The `entity_refs` column each kind the BA cites lands in (`process` is a trace process). */
export const EVIDENCE_COLUMN = {
  state: 'state_id',
  screen_region: 'state_id',
  transition: 'transition_id',
  action: 'action_id',
  form: 'form_id',
  network_call: 'network_call_id',
  open_question: 'open_question_id',
  decision: 'decision_id',
  process: 'trace_process_id',
  process_step: 'trace_step_id',
  doc_record: 'doc_record_id',
  review: 'review_id',
  observation: 'observation_id',
  hypothesis: 'hypothesis_id',
} as const satisfies Record<EvidenceTargetKind, string>;

/** A column of `entity_refs` that names a target (every one but `id` and `element_key`). */
export type RefColumn =
  | (typeof EVIDENCE_COLUMN)[EvidenceTargetKind]
  | 'screen_id'
  | 'action_class_id'
  | 'model_transition_id'
  | 'process_id'
  | 'hypothesis_id'
  | 'form_step_id'
  | 'evidence_file';

/** Insert one ref to `id` in `column` (with an element key for a screen or a state); its id. */
export function insertRef(
  raw: Raw,
  column: RefColumn,
  id: string,
  elementKey: string | null = null,
): string {
  const ref = newId();
  raw
    .prepare(`INSERT INTO entity_refs (id, ${column}, element_key) VALUES (?, ?, ?)`)
    .run(ref, id, elementKey);
  return ref;
}

/** An evidence link as the BA states it, for {@link addEvidenceLink}. */
export interface EvidenceLinkRow {
  target_kind: EvidenceTargetKind;
  target_id: string;
  run_id: string | null;
  note?: string | null;
  /** The element key of a `screen_region`. */
  region?: string | null;
}

/**
 * Write one evidence link of revision `revisionId`: its ref, then the link. `ids` fixes both ids
 * (fixtures that must be byte-stable); otherwise they are new.
 */
export function addEvidenceLink(
  raw: Raw,
  revisionId: string,
  link: EvidenceLinkRow,
  ids?: { link: string; ref: string },
): string {
  const ref = ids?.ref ?? newId();
  raw
    .prepare(
      `INSERT INTO entity_refs (id, ${EVIDENCE_COLUMN[link.target_kind]}, element_key) VALUES (?, ?, ?)`,
    )
    .run(ref, link.target_id, link.target_kind === 'screen_region' ? (link.region ?? null) : null);
  const id = ids?.link ?? newId();
  raw
    .prepare(
      'INSERT INTO doc_evidence_links (id, revision_id, ref_id, run_id, note) VALUES (?, ?, ?, ?, ?)',
    )
    .run(id, revisionId, ref, link.run_id, link.note ?? null);
  return id;
}

/** A ref for what an evidence link cites; a `screen_region` keeps its element key. */
export function insertEvidenceRef(
  raw: Raw,
  kind: EvidenceTargetKind,
  id: string,
  region?: string | null,
): string {
  return insertRef(
    raw,
    EVIDENCE_COLUMN[kind],
    id,
    kind === 'screen_region' ? (region ?? null) : null,
  );
}
