"""The React console's Settings (R-96, spec 068; screen 11): a portal's environments as the chat
service reads them, the stored credentials (names only), the Workbench's use, personas, crawl
rules, hints and budgets, screen identity and the data store. Built from the htmx page's own
readers (`queries_settings`, `queries_identity`, `db.store_info`); the router passes what it read
from the chat service."""

from __future__ import annotations

from typing import Any, NamedTuple

from pydantic import BaseModel

from . import queries_identity, queries_settings
from .models import StoreInfo
from .queries_app import StatusOut, status_out
from .queries_app_review_detail import Option

#: A portal's environments, in the order pages show them (spec 011 FR-008).
PORTAL_ENVS = ("production", "staging", "sandbox")
#: How far the crawler may go, as the forms say it.
ACTION_LIMITS = (
    ("external-side-effect", "fill and submit forms (everything)"),
    ("destructive", "up to deleting things, no outside effects"),
    ("mutating", "change data, never delete"),
    ("read", "only look, never submit"),
)
DEFAULT_LIMIT = "external-side-effect"


class Environment(BaseModel):
    name: str
    base_url: str
    limit: str  # the action class
    limit_word: str
    robots: str | None  # "respect it" · "ignore it"; None: the portal file was not read
    can_revoke: bool  # the chat service keeps the last one


class Persona(BaseModel):
    id: str
    kind: str
    refs: list[str]
    attributes: list[Option]  # name, value as written (a list joined)


class Rules(BaseModel):
    robots: str
    domains: list[str]
    allowed_urls: list[str] | None
    disallowed_urls: list[str]


class Hints(BaseModel):
    release_marker: str | None
    ab_flags: list[str]
    refusals: list[str]
    marker_header: str
    marker_meta: str
    checks_per_scan: int
    probes_per_step: int
    probes_per_scan: int


class Identity(BaseModel):
    profile: str | None
    #: τ in force: the value and who accepted it, from how many labels; None: the default.
    tau: str | None
    same_labels: int
    distinct_labels: int
    classifier: str | None  # its held-out F1 against τ's, and whether it is in force
    can_accept_classifier: bool


class Store(BaseModel):
    environment: str
    path: str
    exists: bool
    size_kb: int


class SettingsPage(BaseModel):
    portal: str
    service_up: bool
    #: The command that starts the chat service, when it does not answer.
    start_hint: str | None
    #: The portal file could not be read through the chat service.
    error: str | None
    environments: list[Environment]
    missing: list[str]
    limits: list[Option]
    not_configured: StatusOut
    credentials: list[Option]  # value the name, label "environment · saved at"
    workbench: str | None  # "n of cap turns used today"
    personas: list[Persona]
    rules: Rules | None
    hints: Hints | None
    identity: Identity
    store: Store
    reviewer: bool


class SettingsRead(NamedTuple):
    """What the router read: the chat service's answer about the portal and the Workbench, the
    store's settings readers' results and whether a reviewer is set."""

    portal: str
    chat: dict[str, Any] | None  # None: the chat service did not answer
    error: str | None
    usage: dict[str, Any] | None
    credentials: list[queries_settings.StoredCredential]
    personas: list[queries_settings.PersonaRow]
    rules: queries_settings.CrawlRules | None
    hints: queries_settings.Hints | None
    identity: queries_identity.Identity
    store: StoreInfo
    reviewer: bool
    start_hint: str


LIMIT_WORDS = dict(ACTION_LIMITS)


def _environments(r: SettingsRead) -> list[Environment]:
    rows = list((r.chat or {}).get("environments") or [])
    robots = None
    if r.rules:
        robots = "respect it" if r.rules.robots == "respect" else "ignore it"
    return [
        Environment(
            name=str(e.get("environment", "")),
            base_url=str(e.get("base_url") or ""),
            limit=str(e.get("max_action_class") or DEFAULT_LIMIT),
            limit_word=LIMIT_WORDS.get(str(e.get("max_action_class") or DEFAULT_LIMIT), ""),
            robots=robots,
            can_revoke=len(rows) > 1,
        )
        for e in rows
        if isinstance(e, dict)
    ]


def _value(v: Any) -> str:
    return ", ".join(str(x) for x in v) if isinstance(v, list | tuple) else str(v)


def _identity(i: queries_identity.Identity) -> Identity:
    tau = None
    if i.tau:
        t = i.tau
        tau = f"{t.value} · accepted by {t.accepted_by} {t.accepted_at} from {t.labels} labels"
    classifier = None
    ready = False
    if i.classifier:
        k = i.classifier
        classifier = f"F1 {k.f1} against τ's {k.tau_f1} on held-out labels, trained {k.trained_at}"
        if k.accepted_at:
            classifier += f" · in force, accepted by {k.accepted_by}"
        elif not k.better:
            classifier += " · τ stays (it does not beat τ)"
        ready = k.better and not k.accepted_at
    return Identity(
        profile=i.profile,
        tau=tau,
        same_labels=i.same_labels,
        distinct_labels=i.distinct_labels,
        classifier=classifier,
        can_accept_classifier=ready,
    )


def settings_page(r: SettingsRead) -> SettingsPage:
    envs = _environments(r)
    configured = {e.name for e in envs}
    h = r.hints
    usage = r.usage
    return SettingsPage(
        portal=r.portal,
        service_up=r.chat is not None,
        start_hint=None if r.chat is not None else r.start_hint,
        error=r.error,
        environments=envs,
        missing=[e for e in PORTAL_ENVS if e not in configured],
        limits=[Option(value=v, label=w) for v, w in ACTION_LIMITS],
        not_configured=status_out("environment", "not_configured"),
        credentials=[
            Option(value=c.name, label=f"{c.environment} · {c.saved_at}") for c in r.credentials
        ],
        workbench=(
            f"{usage.get('turns_today')} of {usage.get('cap')} turns used today."
            " The count starts again at 00:00Z."
            if usage
            else None
        ),
        personas=[
            Persona(
                id=p.id,
                kind=p.kind,
                refs=p.refs,
                attributes=[
                    Option(value=k, label=_value(v)) for k, v in sorted(p.attributes.items())
                ],
            )
            for p in r.personas
        ],
        rules=Rules(**vars(r.rules)) if r.rules else None,
        hints=Hints(**vars(h)) if h else None,
        identity=_identity(r.identity),
        store=Store(
            environment=r.store.environment,
            path=r.store.path,
            exists=r.store.exists,
            size_kb=round(r.store.size_bytes / 1024),
        ),
        reviewer=r.reviewer,
    )
