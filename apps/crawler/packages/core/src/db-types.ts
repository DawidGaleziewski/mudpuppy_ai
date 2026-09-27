import type {
  Confidence,
  EdgeStatus,
  RunStatus,
  SafetyClass,
  Stabilization,
} from './schemas/common.js';
import type { DecisionKind } from './schemas/decision-log.js';
import type { FrontierItemStatus } from './schemas/frontier.js';
import type { PortalDataLogAction } from './schemas/portal-data-log.js';
import type { RobotsOutcome } from './schemas/robots-policy.js';
import type { AnalysisSessionStatus } from './schemas/analysis-session.js';
import type { DocKind } from './schemas/doc-record.js';
import type { RevisionChange, RevisionStatus } from './schemas/doc-revision.js';
import type { EvidenceTargetKind } from './schemas/evidence-link.js';
import type { RelationType } from './schemas/doc-relation.js';
import type { ReviewAction } from './schemas/doc-review.js';
import type { FollowupStatus } from './schemas/followup-task.js';

/** Kysely table types mirroring data/schema/schema.sql. JSON columns are TEXT (stringified JSON). */
export interface RunsTable {
  id: string;
  portal_id: string;
  persona_id: string;
  mode: string;
  environment: string;
  env_version_or_date: string;
  seed_id: string | null;
  viewport: string;
  locale: string;
  browser: string;
  config_snapshot: string;
  status: RunStatus;
  warning: string | null;
  steps_used: number;
  elapsed_ms: number;
  max_depth_reached: number;
  started_at: string;
  ended_at: string | null;
  coverage: string | null;
}

export interface StatesTable {
  id: string;
  portal_id: string;
  fingerprint: string;
  cluster_id: string;
  route_template: string;
  title: string;
  evidence_ref: string;
  confidence: Confidence;
  stabilization: Stabilization;
  first_seen_run: string;
  created_at: string;
}

export interface StateObservationsTable {
  run_id: string;
  state_id: string;
  persona_id: string;
  evidence_ref: string;
  observed_at: string;
}

export interface ActionsTable {
  id: string;
  run_id: string;
  state_id: string;
  role: string;
  accessible_name: string | null;
  action_json: string;
  safety_class: SafetyClass;
  allowed: 0 | 1;
  skip_reason: string | null;
  created_at: string;
}

export interface EdgesTable {
  id: string;
  run_id: string;
  from_state: string;
  to_state: string | null;
  action_json: string;
  safety_class: SafetyClass;
  status: EdgeStatus;
  evidence_ref: string;
  confidence: Confidence;
  error: string | null;
  stabilization: Stabilization;
  created_at: string;
}

export interface FormsTable {
  id: string;
  run_id: string;
  state_id: string;
  fields_json: string;
  evidence_ref: string;
  confidence: Confidence;
  created_at: string;
}

export interface NetworkCallsTable {
  id: string;
  run_id: string;
  edge_id: string | null;
  method: string;
  url_template: string;
  status: number;
  req_schema: string;
  res_schema: string;
  console_errors: string;
  created_at: string;
}

export interface FrontierTable {
  id: string;
  run_id: string;
  state_id: string;
  action_id: string | null;
  action_json: string;
  safety_class: SafetyClass;
  status: FrontierItemStatus;
  priority: number;
  depth: number;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpenQuestionsTable {
  id: string;
  run_id: string;
  text: string;
  about_ref: string;
  status: 'open' | 'addressed';
  created_at: string;
}

export interface RuleCandidatesTable {
  id: string;
  run_id: string;
  text: string;
  about_ref: string;
  evidence_ref: string;
  confidence: 'inferred';
  created_at: string;
}

export interface DecisionLogTable {
  id: string;
  run_id: string;
  kind: DecisionKind;
  rule: string | null;
  reason: string;
  subject_ref: string | null;
  detail_json: string | null;
  created_at: string;
}

export interface RobotsPoliciesTable {
  id: string;
  run_id: string;
  host: string;
  source_url: string;
  final_url: string | null;
  outcome: RobotsOutcome;
  http_status: number | null;
  product_token: string;
  group_used: string | null;
  crawl_delay_s: number | null;
  ignored_lines: number;
  truncated: 0 | 1;
  content_sha256: string | null;
  evidence_ref: string;
  fetched_at: string;
}

export interface PortalDataLogTable {
  id: string;
  portal_id: string;
  environment: string;
  action: PortalDataLogAction;
  operator: string;
  counts_json: string;
  target: string | null;
  created_at: string;
}

export interface AnalysisSessionsTable {
  id: string;
  portal_id: string;
  status: AnalysisSessionStatus;
  passes_json: string;
  summary: string | null;
  gaps_json: string;
  started_at: string;
  ended_at: string | null;
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

export interface DocEvidenceLinksTable {
  id: string;
  revision_id: string;
  target_kind: EvidenceTargetKind;
  target_id: string;
  run_id: string | null;
  note: string | null;
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

export interface Database {
  runs: RunsTable;
  states: StatesTable;
  state_observations: StateObservationsTable;
  actions: ActionsTable;
  edges: EdgesTable;
  forms: FormsTable;
  network_calls: NetworkCallsTable;
  frontier: FrontierTable;
  open_questions: OpenQuestionsTable;
  rule_candidates: RuleCandidatesTable;
  decision_log: DecisionLogTable;
  robots_policies: RobotsPoliciesTable;
  portal_data_log: PortalDataLogTable;
  analysis_sessions: AnalysisSessionsTable;
  analysis_session_runs: AnalysisSessionRunsTable;
  doc_records: DocRecordsTable;
  doc_revisions: DocRevisionsTable;
  doc_evidence_links: DocEvidenceLinksTable;
  doc_relations: DocRelationsTable;
  doc_reviews: DocReviewsTable;
  followup_tasks: FollowupTasksTable;
}
