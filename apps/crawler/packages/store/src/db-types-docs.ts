/** Documentation (Layer B) table types, mirroring data/schema/schema.sql. */
import type { ColumnType } from 'kysely';
import type { Confidence } from '@mudpuppy/core';
import type {
  AnalysisSessionStatus,
  DocKind,
  EvidenceTargetKind,
  FollowupStatus,
  ProcessOutcome,
  ProcessStatus,
  ProcessStepKind,
  RelationType,
  ReviewAction,
  RevisionChange,
  RevisionStatus,
} from '@mudpuppy/docs-model';

export interface AnalysisSessionsTable {
  id: string;
  portal_id: string;
  status: AnalysisSessionStatus;
  passes_json: string;
  summary: string | null;
  gaps_json: string;
  started_at: string;
  ended_at: string | null;
  /** 0053 (spec 080): the process scope a documentation request named; NULL: the whole portal. */
  scope_id: ColumnType<string | null, string | null | undefined, string | null>;
}

export interface AnalysisSessionRunsTable {
  session_id: string;
  run_id: string;
}

export interface DocRecordsTable {
  id: string;
  portal_id: string;
  kind: DocKind;
  key: string;
  seq: number;
  title: string;
  latest_rev: number;
  confirmed_rev: number | null;
  withdrawn: 0 | 1;
  created_at: string;
  updated_at: string;
  /** 0036: the process a PROC record documents (required for `process`, one per process). */
  process_id: ColumnType<string | null, string | null | undefined, string | null>;
}

export interface DocRevisionsTable {
  id: string;
  record_id: string;
  rev_no: number;
  session_id: string;
  change: RevisionChange;
  content_json: string;
  confidence: Confidence;
  not_observable: 0 | 1;
  status: RevisionStatus;
  change_note: string | null;
  responds_to_review: string | null;
  created_at: string;
}

/** 0040 (spec 039 § 15): what a link cites is an `entity_refs` row. */
export interface DocEvidenceLinksTable {
  id: string;
  revision_id: string;
  ref_id: string;
  run_id: string | null;
  note: string | null;
}

/** The view `doc_evidence` (0040): a link with the kind, id and region its ref names. Read only. */
export interface DocEvidenceView {
  id: string;
  revision_id: string;
  ref_id: string;
  run_id: string | null;
  note: string | null;
  target_kind: EvidenceTargetKind;
  target_id: string;
  /** The element key of a `screen_region`. */
  region: string | null;
}

export interface DocRelationsTable {
  from_revision_id: string;
  to_record_id: string;
  type: RelationType;
}

export interface DocReviewsTable {
  id: string;
  revision_id: string;
  action: ReviewAction;
  reviewer: string;
  text: string | null;
  created_at: string;
}

export interface FollowupTasksTable {
  record_id: string;
  status: FollowupStatus;
  run_id: string | null;
  blocked_reason: string | null;
  updated_at: string;
}

export interface ProcessesTable {
  id: string;
  run_id: string;
  portal_id: string;
  persona_id: string;
  name: string;
  goal: string;
  followup_record_id: string | null;
  status: ProcessStatus;
  outcome: ProcessOutcome | null;
  boundary_action_id: string | null;
  observed_result: string | null;
  not_observable: string | null;
  created_at: string;
  ended_at: string | null;
  /** 0034 (spec 039 T081): the step whose click enters the process; null: none marked. */
  trigger_ord: ColumnType<number | null, number | null | undefined, number | null>;
}

export interface ProcessStepsTable {
  id: string;
  process_id: string;
  ord: number;
  intent: string;
  kind: ProcessStepKind;
  action_id: string | null;
  transition_id: string | null;
  value: string | null;
  state_before: string | null;
  state_after: string | null;
  outcomes_json: string;
  evidence_ref: string;
  confidence: Confidence;
  created_at: string;
}
