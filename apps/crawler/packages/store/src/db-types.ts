import type { ColumnType } from 'kysely';
// Crawl model (kernel).
import type {
  Confidence,
  DecisionKind,
  EdgeStatus,
  FrontierItemStatus,
  MarkKind,
  MarkTargetKind,
  OutcomeKind,
  PortalDataLogAction,
  ProbeFault,
  ProbeGroup,
  ProbeSuiteStatus,
  RobotsOutcome,
  RunStatus,
  RunType,
  SafetyClass,
  Stabilization,
  StateKind,
} from '@pathfinder/core';
// Trace model.
import type {
  AgentTurnKind,
  AgentTurnRole,
  PwTraceMode,
  SpanKind,
  SpanStatus,
  TraceLevel,
  TraceServer,
} from '@pathfinder/trace';
// Documentation model.
import type {
  AnalysisSessionStatus,
  DocKind,
  EvidenceTargetKind,
  FollowupStatus,
  ProcessOutcome,
  ProcessStatus,
  ProcessStepKind,
  RelationType,
  ReconcileGroupKind,
  ReconciliationStatus,
  ReviewAction,
  RevisionChange,
  RevisionStatus,
} from '@pathfinder/docs-model';
// Chat model.
import type {
  AmendmentChange,
  AmendmentKind,
  AmendmentStatus,
  AmendmentSupersededReason,
  AmendmentTargetKind,
  BaProcessChange,
  BaProcessSource,
  BaProcessStage,
  ChatConversationStatus,
  ChatMessageRole,
  ChatProposalStatus,
  ChatProposalTargetKind,
  GroupingSuggestionStatus,
  ProcessLiveEnvironment,
  ProcessScopeSource,
  ProcessVariantChange,
  ProcessVariantKind,
  WorkflowStepName,
  WorkflowStepStatus,
} from '@pathfinder/chat-model';

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
  /** 0009: the pathfinder server instance driving the run, and its process id (F-14). */
  owner_id: string | null;
  owner_pid: number | null;
  /** 0027: the kind of directed run; NULL = a plain run (full map or trace by `mode`). */
  run_type: ColumnType<RunType | null, RunType | null | undefined, RunType | null>;
  /** 0027: the run a directed run continues or retries. */
  parent_run_id: ColumnType<string | null, string | null | undefined, string | null>;
  /** 0027: JSON the run's plan came from (start states, skip targets, depth, variation, target edge, marks used). */
  plan_json: ColumnType<string | null, string | null | undefined, string | null>;
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
  /** 0006: `<sha256>.png`, set once when the state is first recorded; NULL if capture failed. */
  screenshot_ref: ColumnType<string | null, string | null | undefined, string | null>;
  /** 0006: Layout JSON ref (element keys and page boxes); NULL if capture failed. */
  layout_ref: ColumnType<string | null, string | null | undefined, string | null>;
  /** 0015: the screen this state is a revision of; NULL only for rows an old crawler wrote. */
  screen_id: ColumnType<string | null, string | null | undefined, string | null>;
  /** 0015: r1, r2, ... by first sighting within the screen. */
  screen_rev: ColumnType<number | null, number | null | undefined, number | null>;
  /** 0022: the form step this state shows; NULL: no controls, or recorded before 0022. */
  form_step_id: ColumnType<string | null, string | null | undefined, string | null>;
  /** 0022: `main` unless the state shows validation errors or was reached by a technical fault. */
  state_kind: ColumnType<StateKind, StateKind | undefined, StateKind>;
}

/** 0022: one step of a form flow on a route template, numbered per (portal, route). */
export interface FormStepsTable {
  id: string;
  portal_id: string;
  route_template: string;
  step_index: number;
  form_name: string | null;
  /** JSON array of sorted `role|name`. */
  controls_json: string;
  label: string;
  first_seen_run: string;
  created_at: string;
}

/** 0023: what one form probe did. JSON columns are stringified JSON; flags are 0/1. */
export interface ProbeOutcomesTable {
  id: string;
  run_id: string;
  from_state_id: string;
  form_step_id: string | null;
  probe_id: string;
  probe_group: ProbeGroup;
  target: string | null;
  inputs_json: string;
  path_json: string;
  fault: ProbeFault | null;
  outcome_kind: OutcomeKind;
  to_state_id: string | null;
  accepted: ColumnType<number, number | undefined, number>;
  possible_new_process: ColumnType<number, number | undefined, number>;
  messages_json: string;
  http_status: number | null;
  reason: string | null;
  evidence_ref: string;
  edge_id: string | null;
  created_at: string;
}

/** 0023: a proposed trace entry built from probe outcomes; the owner approves or dismisses it. */
export interface ProbeSuitesTable {
  id: string;
  portal_id: string;
  run_id: string;
  form_step_id: string | null;
  trace_json: string;
  notes_json: string;
  status: ColumnType<ProbeSuiteStatus, ProbeSuiteStatus | undefined, ProbeSuiteStatus>;
  approved_json: string | null;
  replaced_json: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

/** 0024: a person's instruction on a map target for the next scan; `target_id` has no foreign key. */
export interface MarksTable {
  id: string;
  portal_id: string;
  kind: MarkKind;
  target_kind: MarkTargetKind;
  target_id: string;
  created_by: string;
  created_at: string;
  used_by_run_id: string | null;
  used_at: string | null;
}

/** 0025: the BA's proposed reading of a group of differing states and the owner's confirmation; JSON columns validated by `ReconciliationRow` (docs-model). */
export interface ReconciliationsTable {
  id: string;
  portal_id: string;
  group_key: string;
  group_kind: ReconcileGroupKind;
  snapshot_json: string;
  proposal_json: string;
  proposed_by: string;
  proposed_at: string;
  status: ReconciliationStatus;
  confirmed_json: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
}

/** 0027: the shortest recorded way back to a state, one per (run, state); `steps_json` is validated by `CheckpointRow` (core). */
export interface CheckpointsTable {
  id: string;
  run_id: string;
  state_id: string;
  start_url: string;
  steps_json: string;
  created_at: string;
  updated_at: string;
}

/** 0015: a screen is (portal_id, route_template, cluster_id); its states are its observed revisions. */
export interface ScreensTable {
  id: string;
  portal_id: string;
  route_template: string;
  cluster_id: string;
  title: string;
  first_seen_run: string;
  created_at: string;
  /** 0026: id of the screen this one was merged into (owner-confirmed "same state"); NULL = stands alone. */
  merged_into: string | null;
}

/** 0006: derived wireframe of a state, rebuilt when `generator_version` is stale. */
export interface StateWireframesTable {
  state_id: string;
  generator_version: string;
  svg_ref: string;
  excalidraw_ref: string;
  created_at: string;
}

/**
 * 0007: encrypted test-user credential. Written only by the vault; never exported or joined.
 * `ciphertext` is AES-256-GCM ciphertext || 16-byte tag; `nonce` is 12 bytes.
 */
export interface CredentialsTable {
  id: string;
  portal_id: string;
  environment: string; // free name per portal, format-checked in the table (spec 030 R-61)
  ref_name: string;
  ciphertext: Buffer | Uint8Array;
  nonce: Buffer | Uint8Array;
  /** First 8 hex chars of sha256(key). */
  key_id: string;
  created_at: string;
  updated_at: string;
}

/** 0008: guided chat orchestrator (spec 010). JSON columns are TEXT (stringified JSON). */
export interface ChatConversationsTable {
  id: string;
  portal_id: string | null;
  goal: string;
  acp_session_id: string | null;
  persona_draft: ColumnType<string, string | undefined, string>;
  status: ColumnType<
    ChatConversationStatus,
    ChatConversationStatus | undefined,
    ChatConversationStatus
  >;
  created_at: string;
  updated_at: string;
}

export interface ChatMessagesTable {
  id: string;
  conversation_id: string;
  seq: number;
  role: ChatMessageRole;
  content: string;
  tool_name: string | null;
  error_ref: string | null;
  created_at: string;
}

export interface WorkflowStepsTable {
  id: string;
  conversation_id: string;
  portal_id: string;
  step: WorkflowStepName;
  status: ColumnType<WorkflowStepStatus, WorkflowStepStatus | undefined, WorkflowStepStatus>;
  run_id: string | null;
  session_id: string | null;
  error_ref: string | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

export interface ProcessScopesTable {
  id: string;
  conversation_id: string;
  portal_id: string;
  process_name: string;
  persona: string;
  start_state_id: string;
  end_state_id: string;
  selected_state_ids: string;
  comments: ColumnType<string, string | undefined, string>;
  source: ProcessScopeSource;
  created_at: string;
}

export interface AmendmentsTable {
  id: string;
  key: string;
  portal_id: string;
  scope_id: string | null;
  target_kind: AmendmentTargetKind;
  target_id: string;
  kind: AmendmentKind;
  text: string | null;
  attachment_sha256: string | null;
  attachment_name: string | null;
  author: string;
  status: ColumnType<AmendmentStatus, AmendmentStatus | undefined, AmendmentStatus>;
  anchor_fingerprint: string | null;
  anchor_route_template: string | null;
  anchor_element: string | null;
  superseded_by_run: string | null;
  superseded_reason: AmendmentSupersededReason | null;
  superseded_detail: string | null;
  superseded_at: string | null;
  dismissed_at: string | null;
  reapplied_as: string | null;
  reapplies: string | null;
  created_at: string;
  withdrawn_at: string | null;
  /** 0016: the head's current revision number. */
  rev: ColumnType<number, number | undefined, number>;
  /** 0016: the screen the amendment belongs to. */
  screen_id: string | null;
}

/** 0016: append-only history of an amendment. */
export interface AmendmentRevisionsTable {
  amendment_id: string;
  rev: number;
  base_rev: number | null;
  change: AmendmentChange;
  author: string;
  status: AmendmentStatus;
  target_kind: AmendmentTargetKind;
  target_id: string;
  text: string | null;
  anchor_fingerprint: string | null;
  anchor_route_template: string | null;
  anchor_element: string | null;
  reason: string | null;
  run_id: string | null;
  created_at: string;
}

/** 0017: changes the chat assistant proposes and a person applies or discards (spec 022 R6). */
export interface ChatProposalsTable {
  id: string;
  conversation_id: string;
  portal_id: string;
  target_kind: ChatProposalTargetKind;
  target_id: string | null;
  base_rev: number | null;
  payload: string;
  summary: string;
  status: ColumnType<ChatProposalStatus, ChatProposalStatus | undefined, ChatProposalStatus>;
  applied_amendment_id: string | null;
  applied_rev: number | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

/** 0018: the BA's cut of the portal (spec 022 M5). Head rows; `steps`/`sections` are stringified JSON. */
export interface BaProcessesTable {
  id: string;
  portal_id: string;
  key: string;
  name: string;
  persona: string;
  stage: BaProcessStage;
  rev: number;
  source: BaProcessSource;
  scope_id: string | null;
  suggestion_id: string | null;
  created_at: string;
  updated_at: string;
  /** 0028: set while archived (spec 027). */
  archived_at: string | null;
  /** 0028: the PROC record it was opened from (spec 027 US6). */
  record_key: string | null;
}

export interface BaProcessRevisionsTable {
  process_id: string;
  rev: number;
  base_rev: number | null;
  change: BaProcessChange;
  author: string;
  name: string;
  stage: BaProcessStage;
  /** 0028: the A revision a `stage` change signed off. */
  as_is_rev: number | null;
  created_at: string;
}

export interface ProcessVariantsTable {
  id: string;
  process_id: string;
  label: string;
  kind: ProcessVariantKind;
  rev: number;
  branched_from_variant_id: string | null;
  branched_from_rev: number | null;
  created_at: string;
}

export interface ProcessVariantRevisionsTable {
  variant_id: string;
  rev: number;
  base_rev: number | null;
  change: ProcessVariantChange;
  author: string;
  steps: string;
  note: string | null;
  run_id: string | null;
  restored_from: number | null;
  created_at: string;
}

export interface ProcessDraftsTable {
  variant_id: string;
  author: string;
  base_rev: number;
  steps: string;
  updated_at: string;
}

export interface ProcessLiveTable {
  id: string;
  process_id: string;
  environment: ProcessLiveEnvironment;
  variant_id: string;
  variant_rev: number;
  author: string;
  reason: string | null;
  created_at: string;
}

export interface GroupingSuggestionsTable {
  id: string;
  portal_id: string;
  name: string;
  persona: string;
  steps: string;
  why: string;
  screens_key: string;
  status: ColumnType<
    GroupingSuggestionStatus,
    GroupingSuggestionStatus | undefined,
    GroupingSuggestionStatus
  >;
  conversation_id: string | null;
  process_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface ChangeSpecRevisionsTable {
  process_id: string;
  rev: number;
  base_rev: number | null;
  left_variant_id: string;
  left_rev: number;
  right_variant_id: string;
  right_rev: number;
  sections: string;
  author: string;
  doc_key: string | null;
  created_at: string;
}

export interface StateObservationsTable {
  run_id: string;
  state_id: string;
  persona_id: string;
  evidence_ref: string;
  observed_at: string;
  composition_json: string | null;
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
  /** 0029 (spec 039): the edge as a transition: journey position, start visit, element key. NULL on v1 rows. */
  journey_id: Nullable;
  seq: ColumnType<number | null, number | null | undefined, number | null>;
  from_visit_id: Nullable;
  element_key: Nullable;
  kind: ColumnType<TransitionKind | null, TransitionKind | null | undefined, TransitionKind | null>;
  result: ColumnType<StepResult | null, StepResult | null | undefined, StepResult | null>;
  driver: ColumnType<'agent' | 'headless', 'agent' | 'headless' | undefined, 'agent' | 'headless'>;
}

/** Nullable text column a v1 writer may leave out. */
type Nullable = ColumnType<string | null, string | null | undefined, string | null>;

/** 0029: what a page visit or a transition came to (spec 039 design § 5.6). */
export type StepResult =
  'ok' | 'validation' | 'business_error' | 'technical_error' | 'timeout' | 'blocked';
export type TransitionKind = 'click' | 'fill' | 'select' | 'check' | 'submit' | 'navigate' | 'back';

/** 0029: one build of one scope of a portal (spec 039 design § 5.2). */
export interface BuildsTable {
  id: string;
  portal_id: string;
  scope: string;
  signature: string;
  source: 'assets' | 'marker' | 'unknown';
  assets_json: string;
  first_seen: string;
}

/** 0029: fingerprint v2 components of a state (design § 5.4). */
export interface StateComponentsTable {
  state_id: string;
  structure_hash: string;
  content_hash: string;
  overlay_hash: string;
  calls_hash: string;
  mounts_hash: string;
  minhash: Buffer;
  element_keys: string;
}

export type JourneyStartKind =
  'entry_url' | 'checkpoint' | 'login' | 'backtrack' | 'resume' | 'fresh_session';
export type JourneyEndReason =
  'outcome' | 'backtrack' | 'reset' | 'logout' | 'error' | 'budget' | 'run_end';

/** 0029: one continuous path of a run (design § 5.7). */
export interface JourneysTable {
  id: string;
  run_id: string;
  parent_journey_id: string | null;
  branch_seq: number | null;
  start_kind: JourneyStartKind;
  checkpoint_id: string | null;
  end_reason: JourneyEndReason | null;
  started_at: string;
  ended_at: string | null;
}

/** 0029: a persona attribute, typed input or shown value at a journey position (design § 5.8). */
export interface AttributeWritesTable {
  id: string;
  journey_id: string;
  seq: number;
  name: string;
  source: 'persona' | 'input' | 'shown';
  value_type: 'number' | 'date' | 'enum' | 'bool' | 'text' | 'missing';
  value_num: number | null;
  value_text: string | null;
  element_key: string | null;
  created_at: string;
}

/** 0029: the builds a visit was served by, one per scope. */
export interface ObservationBuildsTable {
  page_visit_id: string;
  build_id: string;
}

export type CoverageStatus = 'active' | 'not_seen_since' | 'untested' | 'retired';

/** 0030 (spec 039 design § 6): one reconcile of one portal. */
export interface ModelVersionsTable {
  id: string;
  portal_id: string;
  seq: number;
  built_at: string;
  algorithm: string;
  threshold: number;
  observation_watermark: string | null;
  decision_watermark: string | null;
  stats_json: string;
}

/** 0030: a screen of the portal model with a stable id and key (F-14@039). */
export interface ModelScreensTable {
  id: string;
  key: string;
  portal_id: string;
  route_key: string;
  title: string;
  status: 'active' | 'merged' | 'retired';
  first_model_version: string;
  created_at: string;
}

export interface ScreenMembersTable {
  screen_id: string;
  state_id: string;
  ordinal: number;
  assigned_by: 'clustering' | 'constraint';
  from_model_version: string;
  to_model_version: string | null;
}

export interface ScreenLineageTable {
  id: string;
  model_version_id: string;
  kind: 'split' | 'merge' | 'retire' | 'revive';
  from_screen_id: string;
  to_screen_id: string | null;
  members_moved: number;
}

export interface StatePairLabelsTable {
  portal_id: string;
  state_a: string;
  state_b: string;
  label: 'clone' | 'near_duplicate' | 'distinct';
  nd_kind: 'cosmetic' | 'dynamic_data' | 'duplication' | null;
  labelled_by: string;
  labelled_at: string;
  reason: string | null;
}

export interface ParameterRolesTable {
  portal_id: string;
  route_template: string;
  param: string;
  role: 'identity' | 'data' | 'ignored';
  decided_by: 'reconciler' | 'person';
  decided_at: string;
}

export interface ActionClassesTable {
  id: string;
  screen_id: string;
  element_key: string;
  kind: TransitionKind;
  is_global: 0 | 1;
  status: CoverageStatus;
  streak_json: string;
  status_model_version: string;
}

export interface ModelTransitionsTable {
  id: string;
  from_screen_id: string;
  action_class_id: string;
  to_screen_id: string | null;
  result: StepResult;
  internal: 0 | 1;
  support: number;
  first_seen_edge_id: string;
  last_seen_edge_id: string;
  status: CoverageStatus;
  status_model_version: string;
}

export interface BuildEpochsTable {
  id: string;
  portal_id: string;
  scope: string;
  environment: string;
  build_id: string;
  first_visit_id: string;
  last_visit_id: string;
  overlaps_previous: 0 | 1;
  model_version_id: string;
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
  /** 0012: the verbatim request URL (query kept); NULL before 0012. */
  url: ColumnType<string | null, string | null | undefined, string | null>;
  /** 0027: masked sample bodies (at most 4096 characters), recorded only outside production; NULL otherwise. */
  req_sample: ColumnType<string | null, string | null | undefined, string | null>;
  res_sample: ColumnType<string | null, string | null | undefined, string | null>;
  /** 0029: sha256 of the response shape (spec 039 design § 5.3); NULL for documents and v1 rows. */
  schema_hash: Nullable;
}

/**
 * 0012: one arrival on a page, its verbatim URL and the hops (JSON `NavigationHop[]`) that led there.
 * 0029: the design's observation (journey, order in the run, step result, context, flags).
 */
export interface PageVisitsTable {
  id: string;
  run_id: string;
  state_id: string;
  edge_id: string | null;
  via: 'navigate' | 'action' | 'relogin' | 'login';
  url: string;
  hops_json: string;
  created_at: string;
  journey_id: Nullable;
  seq: ColumnType<number | null, number | null | undefined, number | null>;
  result: ColumnType<StepResult | null, StepResult | null | undefined, StepResult | null>;
  context_key: Nullable;
  flags_json: ColumnType<string, string | undefined, string>;
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

export interface TraceBootsTable {
  id: string;
  started_at: string;
  ended_at: string | null;
  environment: string;
  server: TraceServer;
  pid: number;
  version: string;
  trace_level: TraceLevel;
  pw_trace: PwTraceMode;
}

export interface TraceSpansTable {
  id: string;
  boot_id: string;
  seq: number;
  run_id: string | null;
  parent_id: string | null;
  kind: SpanKind;
  name: string;
  status: SpanStatus;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  attrs_json: string;
  payload_ref: string | null;
  summary: string;
  decision_id: string | null;
  tool_use_id: string | null;
  agent_id: string | null;
  rationale: string | null;
  pw_trace_path: string | null;
  between_calls: 0 | 1;
}

export interface AgentTurnsTable {
  id: string;
  agent_id: string;
  agent_type: string;
  session_id: string | null;
  message_uuid: string;
  block_index: number;
  api_message_id: string | null;
  run_id: string | null;
  role: AgentTurnRole;
  kind: AgentTurnKind;
  tool_use_id: string | null;
  tool_name: string | null;
  text: string | null;
  payload_ref: string | null;
  is_error: 0 | 1 | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
  matched: 0 | 1;
  created_at: string;
  imported_at: string;
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
  /** 0006: element key; set iff `target_kind = 'screen_region'`. */
  region: ColumnType<string | null, string | null | undefined, string | null>;
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
}

export interface ProcessStepsTable {
  id: string;
  process_id: string;
  ord: number;
  intent: string;
  kind: ProcessStepKind;
  action_id: string | null;
  edge_id: string | null;
  value: string | null;
  state_before: string | null;
  state_after: string | null;
  outcomes_json: string;
  evidence_ref: string;
  confidence: Confidence;
  created_at: string;
}

export interface Database {
  runs: RunsTable;
  screens: ScreensTable;
  states: StatesTable;
  state_wireframes: StateWireframesTable;
  state_observations: StateObservationsTable;
  actions: ActionsTable;
  edges: EdgesTable;
  forms: FormsTable;
  network_calls: NetworkCallsTable;
  page_visits: PageVisitsTable;
  builds: BuildsTable;
  state_components: StateComponentsTable;
  journeys: JourneysTable;
  attribute_writes: AttributeWritesTable;
  observation_builds: ObservationBuildsTable;
  model_versions: ModelVersionsTable;
  model_screens: ModelScreensTable;
  screen_members: ScreenMembersTable;
  screen_lineage: ScreenLineageTable;
  state_pair_labels: StatePairLabelsTable;
  parameter_roles: ParameterRolesTable;
  action_classes: ActionClassesTable;
  model_transitions: ModelTransitionsTable;
  build_epochs: BuildEpochsTable;
  frontier: FrontierTable;
  open_questions: OpenQuestionsTable;
  rule_candidates: RuleCandidatesTable;
  decision_log: DecisionLogTable;
  robots_policies: RobotsPoliciesTable;
  portal_data_log: PortalDataLogTable;
  trace_boots: TraceBootsTable;
  trace_spans: TraceSpansTable;
  agent_turns: AgentTurnsTable;
  analysis_sessions: AnalysisSessionsTable;
  analysis_session_runs: AnalysisSessionRunsTable;
  doc_records: DocRecordsTable;
  doc_revisions: DocRevisionsTable;
  doc_evidence_links: DocEvidenceLinksTable;
  doc_relations: DocRelationsTable;
  doc_reviews: DocReviewsTable;
  followup_tasks: FollowupTasksTable;
  processes: ProcessesTable;
  process_steps: ProcessStepsTable;
  credentials: CredentialsTable;
  chat_conversations: ChatConversationsTable;
  chat_messages: ChatMessagesTable;
  workflow_steps: WorkflowStepsTable;
  process_scopes: ProcessScopesTable;
  amendments: AmendmentsTable;
  amendment_revisions: AmendmentRevisionsTable;
  chat_proposals: ChatProposalsTable;
  grouping_suggestions: GroupingSuggestionsTable;
  ba_processes: BaProcessesTable;
  ba_process_revisions: BaProcessRevisionsTable;
  process_variants: ProcessVariantsTable;
  process_variant_revisions: ProcessVariantRevisionsTable;
  process_drafts: ProcessDraftsTable;
  process_live: ProcessLiveTable;
  change_spec_revisions: ChangeSpecRevisionsTable;
  form_steps: FormStepsTable;
  probe_outcomes: ProbeOutcomesTable;
  probe_suites: ProbeSuitesTable;
  marks: MarksTable;
  reconciliations: ReconciliationsTable;
  checkpoints: CheckpointsTable;
}
