/** Chat, amendment and BA process table types (spec 010, spec 022), mirroring data/schema/schema.sql. */
import type { ColumnType } from 'kysely';
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
  GroupingSuggestionStatus,
  ProcessLiveEnvironment,
  ProcessScopeSource,
  ProcessModelChange,
  ProcessModelKind,
  WorkflowStepName,
  WorkflowStepStatus,
} from '@mudpuppy/chat-model';

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
  /** 0041 (spec 039 § 15): what it is written on, an `entity_refs` row (a state, a state's element, an evidence file). */
  ref_id: string;
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
  /** 0037 (spec 039 § 15; 0041 renamed from `ref_id`): the anchor, a model screen + element key. */
  anchor_ref_id: ColumnType<string | null, string | null | undefined, string | null>;
}

/** The target an amendment (head or revision) is written on, as the views of 0041 name it. */
export interface AmendmentTarget {
  target_kind: AmendmentTargetKind;
  /** A state id, `<state id>#<element key>` or an evidence file. */
  target_id: string;
}

/** 0016: append-only history of an amendment. */
export interface AmendmentRevisionsTable {
  amendment_id: string;
  rev: number;
  base_rev: number | null;
  change: AmendmentChange;
  author: string;
  status: AmendmentStatus;
  /** 0041: what this revision is written on, an `entity_refs` row. */
  ref_id: string;
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
  /** 0041: the amendment the proposal changes; null for a new amendment. */
  amendment_id: string | null;
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
  /** 0036: the screen its trigger opens, and the process_boundary hypothesis it came from. */
  start_screen_id: ColumnType<string | null, string | null | undefined, string | null>;
  boundary_hypothesis_id: ColumnType<string | null, string | null | undefined, string | null>;
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

/** 0036: renamed from `process_variants` (spec 039 design § 13.4). */
export interface ProcessModelsTable {
  id: string;
  process_id: string;
  label: string;
  kind: ProcessModelKind;
  rev: number;
  /** 0039: was `branched_from_variant_id`. */
  branched_from_model_id: string | null;
  branched_from_rev: number | null;
  created_at: string;
}

/** 0036: renamed from `process_variant_revisions`; 0039: `variant_id` → `model_id`. */
export interface ProcessModelRevisionsTable {
  model_id: string;
  rev: number;
  base_rev: number | null;
  change: ProcessModelChange;
  author: string;
  steps: string;
  note: string | null;
  run_id: string | null;
  restored_from: number | null;
  created_at: string;
}

export interface ProcessDraftsTable {
  model_id: string;
  author: string;
  base_rev: number;
  steps: string;
  updated_at: string;
}

export interface ProcessLiveTable {
  id: string;
  process_id: string;
  environment: ProcessLiveEnvironment;
  model_id: string;
  model_rev: number;
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
  left_model_id: string;
  left_rev: number;
  right_model_id: string;
  right_rev: number;
  sections: string;
  author: string;
  doc_key: string | null;
  created_at: string;
}
