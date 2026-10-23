"""The React console's assistant drawer (R-96, spec 069; spec 022 M3 FE-A02–A05): the portal's
conversation as a timeline (messages, system lines, failures with their reference, credential
requests by name only, the assistant's proposals) and whether the chat service runs. Built from
`queries_app_timeline.timeline`, passed in by the router."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from urllib.parse import quote

from pydantic import BaseModel

from . import queries_chat
from .formats import fmt_duration, short_id
from .models import ChatConversation, ChatMessage
from .queries_app import StatusOut, status_out
from .queries_proposals import ProposalView

Kind = Literal["user", "assistant", "system", "error", "credential", "proposal"]


class Credential(BaseModel):
    """The assistant asked for a credential: its reference name, never a value."""

    ref: str
    portal: str
    environment: str
    persona: str
    reason: str | None
    stored: bool
    status: StatusOut


class Proposal(BaseModel):
    summary: str
    key: str | None  # the amendment's AMD key
    target: str | None
    text: str | None
    status: StatusOut
    #: Where it is applied or discarded: Review's proposals.
    href: str


class Item(BaseModel):
    id: str
    kind: Kind
    text: str
    at: str
    ref: str | None = None  # an ERR- reference of a failure
    credential: Credential | None = None
    proposal: Proposal | None = None


class Conversation(BaseModel):
    id: str
    portal: str | None
    #: The dashboard's forwarders to the chat service for this conversation.
    events: str
    send: str
    cancel: str
    reset: str
    credentials: str


class ScanLine(BaseModel):
    """The conversation's run in one line (FE-C02): what it is doing, from the store."""

    status: StatusOut
    what: str  # "Scan 01a16624-db89 · 12 / 120 steps · 9 pages · 3 queued"
    scan: str  # the run's id
    href: str
    running: bool
    #: A running run with no recorded activity for five minutes (F-22).
    quiet: StatusOut | None


class AssistantPage(BaseModel):
    portal: str
    service_up: bool
    start_hint: str | None
    conversation: Conversation | None
    items: list[Item]
    scan: ScanLine | None


#: A running run quiet this long is called out.
QUIET_MS = 5 * 60_000


def scan_line(p: queries_chat.Progress | None, now: datetime) -> ScanLine | None:
    if p is None:
        return None
    steps = f"{p.steps_used} / {p.max_steps}" if p.max_steps else str(p.steps_used)
    kind = "Scan" if p.mode == "map" else "Trace"
    quiet_ms = p.quiet_ms(now)
    quiet = None
    if quiet_ms is not None and quiet_ms >= QUIET_MS:
        quiet = StatusOut(shape="needs", word=f"Nothing for {fmt_duration(quiet_ms)}")
    return ScanLine(
        status=status_out("run", p.status),
        what=f"{kind} {short_id(p.run_id)} · {steps} steps · {p.pages} pages · {p.queued} queued",
        scan=p.run_id,
        href=f"/app/scans/{quote(p.run_id, safe='')}",
        running=p.running,
        quiet=quiet,
    )


def _message(m: ChatMessage) -> Item:
    if m.role == "user":
        kind: Kind = "user"
    elif m.role == "assistant":
        kind = "assistant"
    else:
        kind = "error" if m.error_ref else "system"
    return Item(id=m.id, kind=kind, text=m.content, at=m.created_at, ref=m.error_ref)


def _credential(r: Any) -> Item:
    m = r.message
    return Item(
        id=m.id,
        kind="credential",
        text=r.reason or "",
        at=m.created_at,
        credential=Credential(
            ref=r.ref,
            portal=r.portal,
            environment=r.environment,
            persona=r.persona,
            reason=r.reason,
            stored=r.stored,
            status=status_out("credential", "stored" if r.stored else "needed"),
        ),
    )


def _proposal(portal: str, v: ProposalView) -> Item:
    state = "undone" if v.undone else ("stale" if v.stale else v.p.status)
    payload = v.payload
    return Item(
        id=v.p.id,
        kind="proposal",
        text=v.p.summary,
        at=v.p.created_at,
        proposal=Proposal(
            summary=v.p.summary,
            key=v.key,
            target=payload.get("target_id") if isinstance(payload.get("target_id"), str) else None,
            text=payload.get("text") if isinstance(payload.get("text"), str) else None,
            status=status_out("proposal", state),
            href=f"/app/portals/{quote(portal, safe='')}/review?show=proposals",
        ),
    )


def _conversation(c: ChatConversation) -> Conversation:
    base = f"/chat/conversations/{quote(c.id, safe='')}"
    return Conversation(
        id=c.id,
        portal=c.portal_id,
        events=f"{base}/events",
        send=f"{base}/messages",
        cancel=f"{base}/cancel",
        reset=f"{base}/reset",
        credentials=f"{base}/credentials",
    )


def assistant_page(
    portal: str,
    conversation: ChatConversation | None,
    timeline: list[tuple[str, Any]],
    up: tuple[bool, str],
    scan: ScanLine | None = None,
) -> AssistantPage:
    """`timeline`: `queries_app_timeline.timeline`'s (kind, item) pairs; `up` whether the chat
    service answers and the command that starts it; `scan` the conversation's run in one line."""
    service_up, hint = up
    items = []
    for kind, item in timeline:
        if kind == "credential":
            items.append(_credential(item))
        elif kind == "proposal":
            items.append(_proposal(portal, item))
        else:
            items.append(_message(item))
    return AssistantPage(
        portal=portal,
        service_up=service_up,
        start_hint=None if service_up else hint,
        conversation=_conversation(conversation) if conversation else None,
        items=items,
        scan=scan,
    )
