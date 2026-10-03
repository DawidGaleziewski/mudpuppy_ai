"""Read models mirroring `data/schema/schema.sql`, and the view models derived from them.

Field names and order equal the table columns and every Literal equals its CHECK; both are
enforced by `tests/test_models_schema.py` against a store built from `data/migrations/`.
Zod stays the source of truth for writes (constitution); these only read.
"""

from __future__ import annotations

import json
from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, JsonValue


def _parse_json(value: Any) -> Any:
    """JSON text → value; unparseable text is kept raw so the UI can still show it."""
    if isinstance(value, str | bytes):
        try:
            return json.loads(value)
        except ValueError:
            return value
    return value


Json = Annotated[JsonValue, BeforeValidator(_parse_json)]

RunStatus = Literal["running", "completed", "stopped_warning", "interrupted"]
SafetyClass = Literal["read", "mutating", "destructive", "external-side-effect"]
Confidence = Literal["observed", "inferred", "needs_confirmation"]
Stabilization = Literal["settled", "never_stabilized"]
FrontierStatus = Literal[
    "pending",
    "done",
    "skipped_unsafe",
    "out_of_scope",
    "denylisted",
    "robots_disallowed",
    "budget_reached",
    "unreachable",
]
DecisionKind = Literal["skip", "refuse", "merge", "split", "warning", "note"]
TraceServer = Literal["pathfinder"]
TraceLevel = Literal["off", "standard", "verbose"]
PwTraceMode = Literal["non_production", "all"]
SpanKind = Literal["call", "phase", "event"]
SpanStatus = Literal["running", "ok", "refused", "stopped", "error", "unfinished"]
AgentTurnRole = Literal["assistant", "user"]
AgentTurnKind = Literal["text", "thinking", "tool_use", "tool_result"]
DocKind = Literal[
    "capability",
    "screen",
    "process",
    "use_case",
    "requirement",
    "nfr",
    "business_rule",
    "glossary_term",
    "data_item",
    "assumption",
    "open_question",
    "followup",
]
EvidenceTargetKind = Literal[
    "state",
    "edge",
    "action",
    "form",
    "network_call",
    "rule_candidate",
    "open_question",
    "decision",
    "process",
    "process_step",
    "doc_record",
    "review",
]
RelationType = Literal[
    "contains",
    "describes",
    "refines",
    "enforces",
    "appears_on",
    "uses_term",
    "synonym_of",
    "answers",
    "depends_on",
]

RUN_STATUSES: tuple[RunStatus, ...] = ("running", "completed", "stopped_warning", "interrupted")
FRONTIER_STATUSES: tuple[FrontierStatus, ...] = (
    "pending",
    "done",
    "skipped_unsafe",
    "out_of_scope",
    "denylisted",
    "robots_disallowed",
    "budget_reached",
    "unreachable",
)
DECISION_KINDS: tuple[DecisionKind, ...] = ("skip", "refuse", "merge", "split", "warning", "note")
SAFETY_CLASSES: tuple[SafetyClass, ...] = (
    "read",
    "mutating",
    "destructive",
    "external-side-effect",
)


class Row(BaseModel):
    model_config = ConfigDict(frozen=True)


# --- tables ---------------------------------------------------------------------------------


class Run(Row):
    id: str
    portal_id: str
    persona_id: str
    mode: str
    environment: str
    env_version_or_date: str
    seed_id: str | None
    viewport: str
    locale: str
    browser: str
    config_snapshot: Json
    status: RunStatus
    warning: str | None
    steps_used: int
    elapsed_ms: int
    max_depth_reached: int
    started_at: str
    ended_at: str | None
    coverage: Json | None


class StateObservation(Row):
    run_id: str
    state_id: str
    persona_id: str
    evidence_ref: str
    observed_at: str


class Action(Row):
    id: str
    run_id: str
    state_id: str
    role: str
    accessible_name: str | None
    action_json: Json
    safety_class: SafetyClass
    allowed: bool
    skip_reason: str | None
    created_at: str


class Edge(Row):
    id: str
    run_id: str
    from_state: str
    to_state: str | None
    action_json: Json
    safety_class: SafetyClass
    status: Literal["executed", "skipped"]
    evidence_ref: str
    confidence: Confidence
    error: Json | None
    stabilization: Stabilization
    created_at: str


class Form(Row):
    id: str
    run_id: str
    state_id: str
    fields_json: Json
    evidence_ref: str
    confidence: Confidence
    created_at: str


class NetworkCall(Row):
    id: str
    run_id: str
    edge_id: str | None
    method: str
    url_template: str
    status: int
    req_schema: Json
    res_schema: Json
    console_errors: Json
    created_at: str


class OpenQuestion(Row):
    id: str
    run_id: str
    text: str
    about_ref: str
    status: Literal["open", "addressed"]
    created_at: str


class RuleCandidate(Row):
    id: str
    run_id: str
    text: str
    about_ref: str
    evidence_ref: str
    confidence: Literal["inferred"]
    created_at: str


class State(Row):
    id: str
    portal_id: str
    fingerprint: str
    cluster_id: str
    route_template: str
    title: str
    evidence_ref: str
    confidence: Confidence
    stabilization: Stabilization
    first_seen_run: str
    created_at: str


class FrontierItem(Row):
    id: str
    run_id: str
    state_id: str
    action_id: str | None
    action_json: Json
    safety_class: SafetyClass
    status: FrontierStatus
    priority: int
    depth: int
    reason: str | None
    created_at: str
    updated_at: str


class DecisionLogEntry(Row):
    id: str
    run_id: str
    kind: DecisionKind
    rule: str | None
    reason: str
    subject_ref: str | None
    detail_json: Json | None
    created_at: str


class RobotsPolicy(Row):
    id: str
    run_id: str
    host: str
    source_url: str
    final_url: str | None
    outcome: Literal["rules", "no_rules", "unreachable"]
    http_status: int | None
    product_token: str
    group_used: str | None
    crawl_delay_s: float | None
    ignored_lines: int
    truncated: bool
    content_sha256: str | None
    evidence_ref: str
    fetched_at: str


class PortalDataLog(Row):
    id: str
    portal_id: str
    environment: str
    action: Literal["export", "delete"]
    operator: str
    counts_json: Json
    target: str | None
    created_at: str


class TraceBoot(Row):
    id: str
    started_at: str
    ended_at: str | None
    environment: str
    server: TraceServer
    pid: int
    version: str
    trace_level: TraceLevel
    pw_trace: PwTraceMode


class TraceSpan(Row):
    id: str
    boot_id: str
    seq: int
    run_id: str | None
    parent_id: str | None
    kind: SpanKind
    name: str
    status: SpanStatus
    started_at: str
    ended_at: str | None
    duration_ms: int | None
    attrs_json: Json
    payload_ref: str | None
    summary: str
    decision_id: str | None
    tool_use_id: str | None
    agent_id: str | None
    rationale: str | None
    pw_trace_path: str | None
    between_calls: bool


class AgentTurn(Row):
    id: str
    agent_id: str
    agent_type: str
    session_id: str | None
    message_uuid: str
    block_index: int
    api_message_id: str | None
    run_id: str | None
    role: AgentTurnRole
    kind: AgentTurnKind
    tool_use_id: str | None
    tool_name: str | None
    text: str | None
    payload_ref: str | None
    is_error: bool | None
    model: str | None
    input_tokens: int | None
    output_tokens: int | None
    cache_read_tokens: int | None
    cache_creation_tokens: int | None
    matched: bool
    created_at: str
    imported_at: str


class AnalysisSession(Row):
    id: str
    portal_id: str
    status: Literal["running", "completed", "interrupted"]
    passes_json: Json
    summary: str | None
    gaps_json: Json
    started_at: str
    ended_at: str | None


class AnalysisSessionRun(Row):
    session_id: str
    run_id: str


class DocRecord(Row):
    id: str
    portal_id: str
    kind: DocKind
    key: str
    seq: int
    title: str
    latest_rev: int
    confirmed_rev: int | None
    withdrawn: bool
    created_at: str
    updated_at: str


class DocRevision(Row):
    id: str
    record_id: str
    rev_no: int
    session_id: str
    change: Literal["create", "revise", "withdraw"]
    content_json: Json
    confidence: Confidence
    not_observable: bool
    status: Literal["draft", "confirmed", "rejected", "superseded"]
    change_note: str | None
    responds_to_review: str | None
    created_at: str


class DocEvidenceLink(Row):
    id: str
    revision_id: str
    target_kind: EvidenceTargetKind
    target_id: str
    run_id: str | None
    note: str | None


class DocRelation(Row):
    from_revision_id: str
    to_record_id: str
    type: RelationType


class DocReview(Row):
    id: str
    revision_id: str
    action: Literal["confirm", "reject", "comment"]
    reviewer: str
    text: str | None
    created_at: str


class FollowupTask(Row):
    record_id: str
    status: Literal["open", "in_progress", "done", "blocked", "cancelled"]
    run_id: str | None
    blocked_reason: str | None
    updated_at: str


class Process(Row):
    id: str
    run_id: str
    portal_id: str
    persona_id: str
    name: str
    goal: str
    followup_record_id: str | None
    status: Literal["recorded", "replay_verified", "documented"]
    outcome: Literal["goal_reached", "boundary_reached", "stopped", "abandoned"] | None
    boundary_action_id: str | None
    observed_result: str | None
    not_observable: str | None
    created_at: str
    ended_at: str | None


class ProcessStep(Row):
    id: str
    process_id: str
    ord: int
    intent: str
    kind: Literal["navigate", "click", "fill", "check", "select"]
    action_id: str | None
    edge_id: str | None
    value: str | None
    state_before: str | None
    state_after: str | None
    outcomes_json: Json
    evidence_ref: str
    confidence: Confidence
    created_at: str


TABLE_MODELS: dict[str, type[Row]] = {
    "runs": Run,
    "state_observations": StateObservation,
    "actions": Action,
    "edges": Edge,
    "forms": Form,
    "network_calls": NetworkCall,
    "open_questions": OpenQuestion,
    "rule_candidates": RuleCandidate,
    "states": State,
    "frontier": FrontierItem,
    "decision_log": DecisionLogEntry,
    "robots_policies": RobotsPolicy,
    "portal_data_log": PortalDataLog,
    "trace_boots": TraceBoot,
    "trace_spans": TraceSpan,
    "agent_turns": AgentTurn,
    "analysis_sessions": AnalysisSession,
    "analysis_session_runs": AnalysisSessionRun,
    "doc_records": DocRecord,
    "doc_revisions": DocRevision,
    "doc_evidence_links": DocEvidenceLink,
    "doc_relations": DocRelation,
    "doc_reviews": DocReview,
    "followup_tasks": FollowupTask,
    "processes": Process,
    "process_steps": ProcessStep,
}


# --- view models (derived, never stored) ----------------------------------------------------


class StoreInfo(BaseModel):
    environment: str
    path: str
    exists: bool
    size_bytes: int


class PortalSummary(BaseModel):
    portal_id: str
    runs_by_status: dict[RunStatus, int]
    last_run_at: str | None
    states: int
    actions_allowed: int
    actions_skipped: int
    forms: int
    network_calls: int
    open_questions_open: int
    rule_candidates: int

    @property
    def runs(self) -> int:
        return sum(self.runs_by_status.values())


class RunListItem(BaseModel):
    """A run as listed: the row plus its derived duration."""

    run: Run
    duration_ms: int | None


class RunSummary(BaseModel):
    run: Run
    duration_ms: int | None
    states: int
    actions: int
    frontier: int
    frontier_by_status: dict[FrontierStatus, int]
    forms: int
    network_calls: int
    robots_policies: int
    decisions: int
    decisions_by_kind: dict[DecisionKind, int]
    edges: int
    open_questions: int
    rule_candidates: int


class PhaseStat(BaseModel):
    """One phase name's timing across a run's calls (`trace_summary`, T041)."""

    name: str
    count: int
    sum_ms: int
    p50_ms: int
    p95_ms: int


class TraceTokens(BaseModel):
    turns: int
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_creation_tokens: int


class TraceHealth(BaseModel):
    dropped: int
    truncated: int
    unfinished: int
    unmatched_agent_calls: int
    unmatched_server_calls: int


class TraceSummary(BaseModel):
    """A run's trace at a glance (T041, contracts/dashboard-routes.md)."""

    run_id: str
    calls_total: int
    calls_by_tool: dict[str, int]
    calls_by_status: dict[str, int]
    phases: list[PhaseStat]
    slowest_calls: list[TraceSpan]
    tokens: TraceTokens
    health: TraceHealth
    trace_levels: list[TraceLevel]
    pw_trace_modes: list[PwTraceMode]
    agent_imported: bool


class Page[T](BaseModel):
    items: list[T]
    total: int
    next_cursor: str | None


class DecisionGroup(BaseModel):
    kind: DecisionKind
    rule: str | None
    count: int
    example_reason: str


class ObservedState(BaseModel):
    """A state as observed in one run: the state plus that run's evidence for it."""

    state: State
    observation: StateObservation


# --- Docs tab view models (spec 004, R-15) -----------------------------------------------------

DocStatus = Literal["draft", "confirmed", "rejected", "superseded", "withdrawn"]


class DocPortalSummary(BaseModel):
    """One portal on `/docs`: record counts by displayed status and its last analysis session."""

    portal_id: str
    records: int
    by_status: dict[str, int]
    sessions: int
    last_session_at: str | None
    open_followups: int


class DocRecordRow(BaseModel):
    """A record as listed: the record plus what its latest revision says."""

    record: DocRecord
    rev_no: int
    status: DocStatus
    confidence: Confidence
    not_observable: bool
    summary: str | None
    followup_status: str | None = None
    blocked_reason: str | None = None
    evidence_count: int = 0
    run_count: int = 0
    related: list[str] = []


class ResolvedEvidence(BaseModel):
    """An evidence link with its target looked up in Layer A (or the Docs tables)."""

    link: DocEvidenceLink
    label: str | None
    resolved: bool  # the target row was found
    broken: bool  # the target's table exists but the row is gone
    run_mode: str | None
    run_started_at: str | None
    tab: str | None  # run page tab holding the target, None for doc_record/review
    doc_key: str | None = None  # for doc_record targets


class RelationRow(BaseModel):
    type: RelationType
    record_id: str
    key: str
    title: str
    kind: DocKind
    status: DocStatus


class RevisionEntry(BaseModel):
    """One revision in the history, with the session that wrote it and its review decisions."""

    revision: DocRevision
    reviews: list[DocReview]


class DocRecordDetail(BaseModel):
    record: DocRecord
    status: DocStatus  # of the latest revision (or withdrawn)
    shown: DocRevision  # the revision on screen (`?rev=`, default latest)
    is_latest: bool
    history: list[RevisionEntry]
    evidence: list[ResolvedEvidence]
    relations_out: list[RelationRow]
    relations_in: list[RelationRow]
    followup: FollowupTask | None
    session_started_at: str | None


class SessionDetail(BaseModel):
    session: AnalysisSession
    runs: list[Run]
    written: list[DocRecordRow]  # one page of the records this session created or revised
    written_total: int
    next_cursor: str | None
    changes: dict[str, str]  # record id -> "create" / "revise" / "withdraw" (this page)


class RunCitingRecord(BaseModel):
    """A record citing a run's evidence (FR-033): what it cites and from which revision."""

    row: DocRecordRow
    cites: list[DocEvidenceLink]


class LiveEvent(BaseModel):
    event: Literal["hello", "store-changed"]
    boot_id: str
    data_version: int | None
    dev: bool = False
