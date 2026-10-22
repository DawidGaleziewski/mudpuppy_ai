import type { Confidence } from '@mudpuppy/core';
import type {
  DocKind,
  EvidenceTargetKind,
  RelationType,
  ReviewAction,
  RevisionChange,
  RevisionStatus,
} from '@mudpuppy/docs-model';
import type { StateInventory } from '../param-inventory.js';
import type { ProcessMapInput, ScreenNavInput } from './mermaid.js';
import type { ExportAmendment } from './amendments.js';

/**
 * Everything the SRS export renders, read once from the store (contracts/srs-export.md). The
 * chapters are pure functions of this model; only `loadExportModel` (`export-load.ts`) touches
 * the database.
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
  /** Short human label of the target (no evidence file content); null for a kind without one. */
  label: string | null;
  run_id: string | null;
  run_mode: string | null;
  /** `YYYY-MM-DD` of the run's start. */
  run_date: string | null;
  note: string | null;
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
  /** Screen key → its entry URLs and URL parameters (spec 019); screens without visits are absent. */
  screen_urls: Record<string, StateInventory>;
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
  'api_endpoint',
  'glossary_term',
  'nfr',
  'assumption',
  'open_question',
  'followup',
];
