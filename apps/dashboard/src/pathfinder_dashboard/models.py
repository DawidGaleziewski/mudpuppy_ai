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


class LiveEvent(BaseModel):
    event: Literal["hello", "store-changed"]
    boot_id: str
    data_version: int | None
    dev: bool = False
