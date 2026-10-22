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
StateKind = Literal["main", "validation", "technical"]
ProbeGroup = Literal["validation", "branch", "technical"]
ProbeFault = Literal["block_request", "http_500", "delay", "offline"]
OutcomeKind = Literal["next", "branch", "validation", "technical", "temporary", "blocked"]
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
TraceServer = Literal["mudpuppy"]
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
    "api_endpoint",
]
EvidenceTargetKind = Literal[
    "state",
    "transition",
    "action",
    "form",
    "network_call",
    "open_question",
    "decision",
    "process",
    "process_step",
    "doc_record",
    "review",
    "screen_region",
    "observation",
    "hypothesis",  # spec 039 owner answer 18: a hypothesis of the portal model (H-nnnn)
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
    "applies_on",
    "asks_about",
    "follows_up",
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
    owner_id: str | None = None  # 0009: mudpuppy server driving the run (F-14)
    owner_pid: int | None = None
    # 0027 (spec 034): directed runs; NULL run_type = a plain run (full map or trace by mode)
    run_type: (
        Literal["full", "continue", "focused", "recheck", "retry", "probe", "trace"] | None
    ) = None
    parent_run_id: str | None = None
    plan_json: Json | None = None


class StateObservation(Row):
    run_id: str
    state_id: str
    persona_id: str
    evidence_ref: str
    observed_at: str
    composition_json: str | None = None


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


class Transition(Row):
    """v1's `edges`, renamed by 0032 (spec 039 T110)."""

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
    # 0029 (spec 039): journey position, element key, kind, result; NULL on v1 rows
    journey_id: str | None = None
    seq: int | None = None
    from_observation_id: str | None = None
    element_key: str | None = None
    kind: TransitionKind | None = None
    result: StepResult | None = None
    driver: Literal["agent", "headless"] = "agent"


StepResult = Literal["ok", "validation", "business_error", "technical_error", "timeout", "blocked"]
TransitionKind = Literal["click", "fill", "select", "check", "submit", "navigate", "back"]


class Build(Row):
    """0029 (spec 039): one build of one scope of a portal."""

    id: str
    portal_id: str
    scope: str
    signature: str
    source: Literal["assets", "marker", "unknown"]
    assets_json: Json
    first_seen: str


class StateComponents(Row):
    """0029 (spec 039): fingerprint v2 components of a state (MinHash kept as bytes)."""

    state_id: str
    structure_hash: str
    content_hash: str
    overlay_hash: str
    calls_hash: str
    mounts_hash: str
    minhash: bytes
    element_keys: Json
    profile: str | None = None  # 0033 (T112): the fingerprint profile; NULL = rows-v2


class Journey(Row):
    """0029 (spec 039): one continuous path of a run."""

    id: str
    run_id: str
    parent_journey_id: str | None
    branch_seq: int | None
    start_kind: Literal["entry_url", "checkpoint", "login", "backtrack", "resume", "fresh_session"]
    checkpoint_id: str | None
    end_reason: (
        Literal["outcome", "backtrack", "reset", "logout", "error", "budget", "run_end"] | None
    )
    started_at: str
    ended_at: str | None


class AttributeWrite(Row):
    """0029 (spec 039): a persona attribute, typed input or shown value at a journey position."""

    id: str
    journey_id: str
    seq: int
    name: str
    source: Literal["persona", "input", "shown"]
    value_type: Literal["number", "date", "enum", "bool", "text", "missing"]
    value_num: float | None
    value_text: str | None
    element_key: str | None
    created_at: str


class ObservationBuild(Row):
    """0029 (spec 039): a build that served a visit."""

    observation_id: str
    build_id: str


CoverageStatus = Literal["active", "not_seen_since", "untested", "retired"]


class ModelVersion(Row):
    """0030 (spec 039): one reconcile of one portal."""

    id: str
    portal_id: str
    seq: int
    built_at: str
    algorithm: str
    threshold: float
    observation_watermark: str | None
    decision_watermark: str | None
    stats_json: Json
    fingerprint_profile: str | None = None  # 0033 (T112): the profile it was clustered under


class ModelScreen(Row):
    """0030 (spec 039): a screen of the portal model (abstract state) with a stable id."""

    id: str
    key: str
    portal_id: str
    route_key: str
    title: str
    status: Literal["active", "merged", "retired"]
    first_model_version: str
    created_at: str


class ScreenMember(Row):
    """0030: a page version's membership of a model screen, per model version."""

    screen_id: str
    state_id: str
    ordinal: int
    assigned_by: Literal["clustering", "constraint"]
    from_model_version: str
    to_model_version: str | None


class ScreenLineage(Row):
    """0030: a split, merge, retirement or revival of a model screen."""

    id: str
    model_version_id: str
    kind: Literal["split", "merge", "retire", "revive"]
    from_screen_id: str
    to_screen_id: str | None
    members_moved: int


class StatePairLabel(Row):
    """0030: a person's "same screen?" answer for two page versions."""

    portal_id: str
    state_a: str
    state_b: str
    label: Literal["clone", "near_duplicate", "distinct"]
    nd_kind: Literal["cosmetic", "dynamic_data", "duplication"] | None
    labelled_by: str
    labelled_at: str
    reason: str | None


class StatePairLabelHistory(Row):
    """0045: one row per "same screen?" answer, append-only; StatePairLabel is the current one."""

    id: str
    portal_id: str
    state_a: str
    state_b: str
    label: Literal["clone", "near_duplicate", "distinct"]
    nd_kind: Literal["cosmetic", "dynamic_data", "duplication"] | None
    labelled_by: str
    labelled_at: str
    reason: str | None


class ParameterRoleRow(Row):
    """0030: what a parameter of a route template does."""

    portal_id: str
    route_template: str
    param: str
    role: Literal["identity", "data", "ignored"]
    decided_by: Literal["reconciler", "person"]
    decided_at: str


class ActionClass(Row):
    """0030: one element of a model screen, matched across runs, with its coverage."""

    id: str
    screen_id: str
    element_key: str
    kind: TransitionKind
    is_global: bool
    status: CoverageStatus
    streak_json: Json
    status_model_version: str


class ModelTransition(Row):
    """0030: screen → action → screen across runs."""

    id: str
    from_screen_id: str
    action_class_id: str
    to_screen_id: str | None
    result: StepResult
    internal: bool
    support: int
    first_seen_transition_id: str
    last_seen_transition_id: str
    status: CoverageStatus
    status_model_version: str


HypothesisStatus = Literal[
    "proposed", "testing", "supported", "refuted", "confirmed", "rejected", "superseded"
]


class EntityRef(Row):
    """0031 (spec 039): a typed reference, exactly one target."""

    id: str
    observation_id: str | None
    transition_id: str | None
    state_id: str | None
    screen_id: str | None
    action_class_id: str | None
    model_transition_id: str | None
    process_id: str | None
    hypothesis_id: str | None
    network_call_id: str | None
    # 0040 (spec 039 § 15): the kinds the BA cites; trace processes and steps are v1's tables
    action_id: str | None = None
    form_id: str | None = None
    open_question_id: str | None = None
    decision_id: str | None = None
    review_id: str | None = None
    doc_record_id: str | None = None
    trace_process_id: str | None = None
    trace_step_id: str | None = None
    form_step_id: str | None = None
    evidence_file: str | None = None
    element_key: str | None


class Deviation(Row):
    """0031: a place a new model version did not fit the previous one."""

    id: str
    portal_id: str
    model_version_id: str
    kind: Literal[
        "new_screen",
        "new_member",
        "new_action",
        "missing_action",
        "target_mismatch",
        "result_mismatch",
        "rule_mismatch",
    ]
    subject_key: str
    screen_id: str | None
    state_id: str | None
    action_class_id: str | None
    before_json: Json | None
    after_json: Json | None
    changed_components: Json
    context_diff: Json
    status: Literal["open", "waiting_test", "explained"]
    created_at: str


class DeviationOccurrence(Row):
    """0031: a later model version that showed the same deviation again."""

    deviation_id: str
    model_version_id: str


class Hypothesis(Row):
    """0031: a testable claim; its status comes from its events."""

    id: str
    key: str
    portal_id: str
    kind: Literal[
        "same_as",
        "different_from",
        "parameter_role",
        "structural_drift",
        "backend_drift",
        "decision_drift",
        "context_variant",
        "ab_test",
        "flaky",
        "nondeterministic",
        "deterministic_error",
        "removed",
        "replaces",
        "coverage_gap",
        "business_error_template",
        "decision_point",
        "decision_rule",
        "process_boundary",
        "correlation_id",
        "ambiguous",
    ]
    claim: str
    claim_json: Json
    claim_hash: str
    origin: Literal["rule", "agent", "person"]
    rule: str | None
    derived: bool
    confidence: Confidence
    fitness: float | None
    precision: float | None
    support: int | None
    counterexamples: int | None
    deviation_id: str | None
    superseded_by: str | None
    model_version_id: str
    created_at: str


class HypothesisEvidence(Row):
    hypothesis_id: str
    ref_id: str
    role: Literal["supports", "contradicts", "context"]


class HypothesisTest(Row):
    id: str
    hypothesis_id: str
    probe_suite_id: str | None
    mark_id: str | None
    inputs_json: Json
    refutes_if_json: Json
    result_json: Json | None
    verdict: Literal["pass", "fail", "inconclusive"] | None
    run_id: str | None
    created_at: str


class HypothesisEvent(Row):
    """0031: a hypothesis status change, with its reason."""

    id: str
    hypothesis_id: str
    from_status: HypothesisStatus | None
    to_status: HypothesisStatus
    actor: str
    reason: str
    at: str
    decision_id: str | None
    undoes: str | None


class HypothesisWording(Row):
    """0046: a person's Reword of a rule; append-only, the latest row is the wording in force."""

    id: str
    hypothesis_id: str
    wording: str
    actor: str
    reason: str | None
    at: str


class FingerprintProfile(Row):
    """0033 (spec 039 T111): a fingerprint profile a portal used, with its resolved rules."""

    portal_id: str
    id: str
    name: str
    rules_json: Json
    first_seen: str


class TauAcceptance(Row):
    """0033 (spec 039 T115): a τ a person accepted for a portal and profile; the latest counts."""

    id: str
    portal_id: str
    profile: str
    tau: float
    labels: int
    f1: float | None
    accepted_by: str
    accepted_at: str


class SimilarityClassifier(Row):
    """0038 (spec 039 FR-050): a similarity classifier trained for a portal and profile."""

    id: str
    portal_id: str
    profile: str
    features: Json
    weights: Json
    intercept: float
    labels: int
    held_out: int
    f1: float
    tau: float
    tau_f1: float
    better: bool
    trained_at: str
    accepted_by: str | None  # 0039 (owner answer 14): set when a person puts it in force
    accepted_at: str | None


class CorrelationId(Row):
    """0036 (spec 039 § 13.4): a value reused within a journey, stored hashed."""

    id: str
    journey_id: str
    key_path: str
    value_hash: str
    endpoint_family: str
    first_transition_id: str
    last_transition_id: str


class ProcessInstance(Row):
    """0036: one journey through a process from its trigger, with the outcome. 0039: the trigger
    is a transition or a deep link (a URL opened on the start screen)."""

    id: str
    process_id: str
    journey_id: str
    trigger_kind: Literal["transition", "deep_link"]
    trigger_transition_id: str | None
    trigger_observation_id: str | None
    last_transition_id: str | None
    outcome: Literal["completed", "exited", "error", "abandoned", "incomplete"]
    outcome_screen_id: str | None
    correlation_id: str | None
    model_version_id: str
    screens_json: str | None  # 0043: JSON array of the model screen ids walked, start first


class ProcessTrigger(Row):
    """0036: a model transition that starts a process."""

    process_id: str
    model_transition_id: str


class ProcessExploration(Row):
    """0036: one completed exploration of a process (the stopping rule)."""

    id: str
    process_id: str
    epoch_set: Json
    depth: int
    random_walks: int
    new_deviations: int
    completed_at: str


class BuildEpoch(Row):
    """0030: the period a build of a scope served, per environment."""

    id: str
    portal_id: str
    scope: str
    environment: str
    build_id: str
    first_observation_id: str
    last_observation_id: str
    overlaps_previous: bool
    model_version_id: str


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
    transition_id: str | None
    method: str
    url_template: str
    status: int
    req_schema: Json
    res_schema: Json
    console_errors: Json
    created_at: str
    url: str | None = None  # 0012: verbatim request URL; NULL before 0012
    req_sample: str | None = None  # 0027: masked sample body (<= 4096 chars), non-production only
    res_sample: str | None = None
    schema_hash: str | None = None  # 0029: sha256 of the response shape; NULL for documents


class Observation(Row):
    """0012 (spec 019): one arrival on a page, its verbatim URL and the hops that led there.

    `page_visits` until 0032 renamed it (spec 039 T110).
    """

    id: str
    run_id: str
    state_id: str
    transition_id: str | None
    via: Literal["navigate", "action", "relogin", "login"]
    url: str
    hops_json: Json
    created_at: str
    # 0029 (spec 039): journey position, result, context, flags; NULL on v1 rows
    journey_id: str | None = None
    seq: int | None = None
    result: StepResult | None = None
    context_key: str | None = None
    flags_json: Json = None
    fingerprint_profile: str | None = None  # 0033 (T112): `name@hash`; NULL = rows-v2


class OpenQuestion(Row):
    id: str
    run_id: str
    text: str
    ref_id: str  # 0040 (spec 039 § 15): the subject, a state, transition or form ref
    status: Literal["open", "addressed"]
    created_at: str
    hypothesis_id: str | None = None  # 0031 (spec 039): the hypothesis it is about


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
    screenshot_ref: str | None = None  # spec 008: PNG, set when the state was first recorded
    layout_ref: str | None = None  # spec 008: Layout JSON (element keys and boxes)
    screen_id: str | None = None  # 0015: the screen this state is a revision of
    screen_rev: int | None = None  # 0015: r1, r2, ... by first sighting within the screen
    form_step_id: str | None = None  # 0022: the form step this state shows
    state_kind: StateKind = "main"  # 0022: validation / technical states are not main screens


class FormStep(Row):
    """One step of a form flow on a route template (0022), numbered in first-seen order."""

    id: str
    portal_id: str
    route_template: str
    step_index: int
    form_name: str | None
    controls_json: Json  # sorted `role|name` strings
    label: str
    first_seen_run: str
    created_at: str


class ProbeOutcome(Row):
    """What one form probe did (0023); `path_json` is how the step was reached in that run."""

    id: str
    run_id: str
    from_state_id: str
    form_step_id: str | None
    probe_id: str
    probe_group: ProbeGroup
    target: str | None
    inputs_json: Json
    path_json: Json
    fault: ProbeFault | None
    outcome_kind: OutcomeKind
    to_state_id: str | None
    accepted: bool
    possible_new_process: bool
    messages_json: Json
    http_status: int | None
    reason: str | None
    evidence_ref: str
    transition_id: str | None
    created_at: str


class ProbeSuite(Row):
    """A trace entry proposed from probe outcomes, waiting for the owner (0023)."""

    id: str
    portal_id: str
    run_id: str
    form_step_id: str | None
    trace_json: Json
    notes_json: Json
    status: Literal["open", "approved", "dismissed"]
    approved_json: Json | None
    replaced_json: Json | None
    decided_by: str | None
    decided_at: str | None
    created_at: str


class Mark(Row):
    """A person's instruction on a map target for the next scan (0024); open until a run uses it."""

    id: str
    portal_id: str
    kind: Literal["start", "focus", "probe", "retry", "recheck", "skip"]
    # 0041 (spec 039 § 15): the target in a typed column, exactly one
    form_step_id: str | None = None
    state_id: str | None = None
    transition_id: str | None = None
    created_by: str
    created_at: str
    used_by_run_id: str | None
    used_at: str | None
    # 0031 (spec 039): a person's mark or the planner's, the hypothesis it tests, its priority
    origin: Literal["person", "planner"] = "person"
    hypothesis_id: str | None = None
    priority: int | None = None


class Checkpoint(Row):
    """The shortest recorded way back to a state, one per (run, state) (0027, spec 034)."""

    id: str
    run_id: str
    state_id: str
    start_url: str
    steps_json: Json
    created_at: str
    updated_at: str


class Screen(Row):
    """A screen (0015): (portal, route template, cluster); its states are its observed revisions."""

    id: str
    portal_id: str
    route_template: str
    cluster_id: str
    title: str
    first_seen_run: str
    created_at: str
    merged_into: str | None = None  # 0026: owner-confirmed "same state" merge target


class StateWireframe(Row):
    """Derived wireframe of a state (spec 008); rebuilt when `generator_version` is stale."""

    state_id: str
    generator_version: str
    svg_ref: str
    excalidraw_ref: str
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
    process_id: str | None = None  # 0036: the process a PROC record documents (one per process)


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
    """0040 (spec 039 § 15): what a link cites is an `entity_refs` row."""

    id: str
    revision_id: str
    ref_id: str
    run_id: str | None
    note: str | None


class DocEvidence(Row):
    """A row of the view `doc_evidence` (0040): a link with the kind and id its ref names."""

    id: str
    revision_id: str
    ref_id: str
    run_id: str | None
    note: str | None
    target_kind: EvidenceTargetKind
    target_id: str
    region: str | None = None  # element key; screen_region only (spec 008)


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
    trigger_ord: int | None = None  # 0034 (T081): the step that enters the process


class ProcessStep(Row):
    id: str
    process_id: str
    ord: int
    intent: str
    kind: Literal["navigate", "click", "fill", "check", "select"]
    action_id: str | None
    transition_id: str | None
    value: str | None
    state_before: str | None
    state_after: str | None
    outcomes_json: Json
    evidence_ref: str
    confidence: Confidence
    created_at: str


class Credential(Row):
    """A vault row (spec 009 R-26): listed for the schema; the dashboard never decrypts one."""

    id: str
    portal_id: str
    environment: Literal["sandbox", "staging", "production"]
    ref_name: str
    ciphertext: bytes
    nonce: bytes
    key_id: str
    created_at: str
    updated_at: str


class ChatConversation(Row):
    """Guided chat orchestrator state (spec 010, R-30); written only by @mudpuppy/chat."""

    id: str
    portal_id: str | None
    goal: str
    acp_session_id: str | None
    persona_draft: Json
    status: Literal["active", "closed"]
    created_at: str
    updated_at: str


class ChatMessage(Row):
    id: str
    conversation_id: str
    seq: int
    role: Literal["user", "assistant", "system", "tool"]
    content: str
    tool_name: str | None
    error_ref: str | None
    created_at: str


class WorkflowStep(Row):
    id: str
    conversation_id: str
    portal_id: str
    step: Literal["scan", "map", "narrow", "document", "amend"]
    status: Literal["todo", "pending", "in_progress", "done", "failed", "stopped"]
    run_id: str | None
    session_id: str | None
    error_ref: str | None
    started_at: str | None
    finished_at: str | None
    updated_at: str


class ProcessScope(Row):
    id: str
    conversation_id: str
    portal_id: str
    process_name: str
    persona: str
    start_state_id: str
    end_state_id: str
    selected_state_ids: Json
    comments: Json
    source: Literal["agent_proposal", "ba_description"]
    created_at: str


class Amendment(Row):
    """A BA amendment; never joined into Layer B records."""

    id: str
    key: str
    portal_id: str
    scope_id: str | None
    ref_id: str  # 0041: what it is written on, an entity_refs row
    kind: Literal["note", "element_ref", "attachment"]
    text: str | None
    attachment_sha256: str | None
    attachment_name: str | None
    author: str
    status: Literal["active", "needs_reanchor", "dismissed", "withdrawn"]
    anchor_fingerprint: str | None
    anchor_route_template: str | None
    anchor_element: Json | None
    superseded_by_run: str | None
    superseded_reason: Literal["state_replaced", "element_changed", "element_removed"] | None
    superseded_detail: str | None
    superseded_at: str | None
    dismissed_at: str | None
    reapplied_as: str | None
    reapplies: str | None
    created_at: str
    withdrawn_at: str | None
    rev: int  # 0016: the head's current revision number
    screen_id: str | None  # 0016: the screen the amendment belongs to
    anchor_ref_id: str | None = None  # 0037 (0041 renamed): the model anchor, screen + element key


#: What an amendment (head or revision) is written on, as the 0041 views name it.
AmendmentTargetKind = Literal["state", "evidence", "wireframe_element"]


class AmendmentWithTarget(Amendment):
    """A row of the view `amendments_with_target` (0041)."""

    target_kind: AmendmentTargetKind
    target_id: str  # a state id, `<state id>#<element key>` or an evidence file


class AmendmentRevision(Row):
    """One immutable revision of an amendment (0016, append-only)."""

    amendment_id: str
    rev: int
    base_rev: int | None
    change: Literal[
        "create",
        "edit",
        "carry_forward",
        "needs_reanchor",
        "reanchor",
        "withdraw",
        "restore",
        "dismiss",
    ]
    author: str
    status: Literal["active", "needs_reanchor", "dismissed", "withdrawn"]
    ref_id: str  # 0041: what this revision is written on, an entity_refs row
    text: str | None
    anchor_fingerprint: str | None
    anchor_route_template: str | None
    anchor_element: Json | None
    reason: str | None
    run_id: str | None
    created_at: str


class AmendmentRevisionWithTarget(AmendmentRevision):
    """A row of the view `amendment_revisions_with_target` (0041)."""

    target_kind: AmendmentTargetKind
    target_id: str


class ChatProposal(Row):
    """A change the chat assistant proposes and a person applies or discards (0017)."""

    id: str
    conversation_id: str
    portal_id: str
    amendment_id: str | None  # 0041: the amendment it changes; None for a new amendment
    base_rev: int | None  # the amendment revision the proposal was made on
    payload: Json  # what to change; a JSON object
    summary: str
    status: Literal["open", "applied", "discarded", "stale"]
    applied_amendment_id: str | None
    applied_rev: int | None
    decided_by: str | None
    decided_at: str | None
    created_at: str


BaProcessStage = Literal["scoped", "as_is_documented", "to_be_design", "migrating", "migrated"]


class BaProcess(Row):
    """The BA's cut of the portal, head row (0018); `rev` is the current process revision."""

    id: str
    portal_id: str
    key: str  # PRC-nnn, per portal
    name: str
    persona: str
    stage: BaProcessStage
    rev: int
    source: Literal["suggestion", "scope", "new"]
    scope_id: str | None
    suggestion_id: str | None
    created_at: str
    updated_at: str
    archived_at: str | None = None  # 0028: set while archived (spec 027)
    record_key: str | None = None  # 0028: the PROC record it was opened from (spec 027 US6)
    start_screen_id: str | None = None  # 0036: the screen its trigger opens
    boundary_hypothesis_id: str | None = None  # 0036: the process_boundary hypothesis


class BaProcessRevision(Row):
    """One immutable revision of a BA process (0018, append-only; 0028 archive and sign-off)."""

    process_id: str
    rev: int
    base_rev: int | None
    change: Literal["create", "rename", "stage", "restore", "archive", "unarchive"]
    author: str
    name: str
    stage: BaProcessStage
    as_is_rev: int | None = None  # 0028: the A revision a stage change signed off
    created_at: str


class ProcessModel(Row):
    """Head of one process model (A, B, ...) of a BA process (0018; 0039 renamed from variant)."""

    id: str
    process_id: str
    label: str
    kind: Literal["as_is", "to_be"]
    rev: int
    branched_from_model_id: str | None
    branched_from_rev: int | None
    created_at: str


class ProcessModelRevision(Row):
    """One immutable revision of a process model (0018, append-only); `steps` is a JSON array."""

    model_id: str
    rev: int
    base_rev: int | None
    change: Literal["create", "branch", "save", "restore", "observe", "edit"]
    author: str
    steps: Json
    note: str | None
    run_id: str | None
    restored_from: int | None
    created_at: str


class ProcessDraft(Row):
    """One person's open draft over one to-be process model (0018, scratch)."""

    model_id: str
    author: str
    base_rev: int
    steps: Json
    updated_at: str


class ProcessLive(Row):
    """A mark that a process model revision is live in an environment (0018, append-only)."""

    id: str
    process_id: str
    environment: Literal["sandbox", "staging", "production"]
    model_id: str
    model_rev: int
    author: str
    reason: str | None
    created_at: str


class GroupingSuggestion(Row):
    """A grouping of screens the assistant suggests as a process (0018)."""

    id: str
    portal_id: str
    name: str
    persona: str
    steps: Json
    why: str
    screens_key: str
    status: Literal["open", "accepted", "dismissed"]
    conversation_id: str | None
    process_id: str | None
    decided_by: str | None
    decided_at: str | None
    created_at: str


class ChangeSpecRevision(Row):
    """One immutable revision of a change spec (0018, append-only); `sections` is a JSON object."""

    process_id: str
    rev: int
    base_rev: int | None
    left_model_id: str
    left_rev: int
    right_model_id: str
    right_rev: int
    sections: Json
    author: str
    doc_key: str | None
    created_at: str


TABLE_MODELS: dict[str, type[Row]] = {
    "runs": Run,
    "state_observations": StateObservation,
    "actions": Action,
    "transitions": Transition,
    "forms": Form,
    "network_calls": NetworkCall,
    "observations": Observation,
    "open_questions": OpenQuestion,
    "screens": Screen,
    "states": State,
    "state_wireframes": StateWireframe,
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
    "credentials": Credential,
    "chat_conversations": ChatConversation,
    "chat_messages": ChatMessage,
    "workflow_steps": WorkflowStep,
    "process_scopes": ProcessScope,
    "amendments": Amendment,
    "amendment_revisions": AmendmentRevision,
    "chat_proposals": ChatProposal,
    "grouping_suggestions": GroupingSuggestion,
    "ba_processes": BaProcess,
    "ba_process_revisions": BaProcessRevision,
    "process_models": ProcessModel,
    "process_model_revisions": ProcessModelRevision,
    "process_drafts": ProcessDraft,
    "process_live": ProcessLive,
    "change_spec_revisions": ChangeSpecRevision,
    "form_steps": FormStep,
    "probe_outcomes": ProbeOutcome,
    "probe_suites": ProbeSuite,
    "marks": Mark,
    "checkpoints": Checkpoint,
    "builds": Build,
    "state_components": StateComponents,
    "journeys": Journey,
    "attribute_writes": AttributeWrite,
    "observation_builds": ObservationBuild,
    "model_versions": ModelVersion,
    "model_screens": ModelScreen,
    "screen_members": ScreenMember,
    "screen_lineage": ScreenLineage,
    "state_pair_labels": StatePairLabel,
    "state_pair_label_history": StatePairLabelHistory,
    "parameter_roles": ParameterRoleRow,
    "action_classes": ActionClass,
    "model_transitions": ModelTransition,
    "build_epochs": BuildEpoch,
    "entity_refs": EntityRef,
    "deviations": Deviation,
    "deviation_occurrences": DeviationOccurrence,
    "hypotheses": Hypothesis,
    "hypothesis_evidence": HypothesisEvidence,
    "hypothesis_tests": HypothesisTest,
    "hypothesis_events": HypothesisEvent,
    "hypothesis_wordings": HypothesisWording,
    "fingerprint_profiles": FingerprintProfile,
    "tau_acceptances": TauAcceptance,
    "correlation_ids": CorrelationId,
    "process_instances": ProcessInstance,
    "process_triggers": ProcessTrigger,
    "process_explorations": ProcessExploration,
    "similarity_classifiers": SimilarityClassifier,
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
    transitions: int
    open_questions: int


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

    link: DocEvidence
    label: str | None
    resolved: bool  # the target row was found (refs keep it in place since 0040)
    run_mode: str | None
    run_started_at: str | None
    tab: str | None  # run page tab holding the target, None for doc_record/review
    doc_key: str | None = None  # a doc_record target's key, or a hypothesis target's H-nnnn


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
    cites: list[DocEvidence]


class LiveEvent(BaseModel):
    event: Literal["hello", "store-changed"]
    boot_id: str
    data_version: int | None
    dev: bool = False
