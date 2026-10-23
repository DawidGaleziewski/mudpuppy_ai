"""The React console's assistant drawer (R-96, spec 069; spec 022 M3 FE-A02–A05): the portal's
conversation as a timeline (messages, system lines, failures with their reference, credential
requests by name only, the assistant's proposals) and whether the chat service runs. Built from
the htmx drawer's own timeline (`web/views_chat.timeline`, passed in by the router)."""

from __future__ import annotations

from typing import Any, Literal
from urllib.parse import quote

from pydantic import BaseModel

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


class AssistantPage(BaseModel):
    portal: str
    service_up: bool
    start_hint: str | None
    conversation: Conversation | None
    items: list[Item]
    #: The full page of the conversation (htmx until spec 070).
    full_page: str


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
) -> AssistantPage:
    """`timeline` is `views_chat.timeline`'s (kind, item) pairs; `up` whether the chat service
    answers and the command that starts it."""
    service_up, hint = up
    items = []
    for kind, item in timeline:
        if kind == "credential":
            items.append(_credential(item))
        elif kind == "proposal":
            items.append(_proposal(portal, item))
        else:
            items.append(_message(item))
    query = f"?conversation={quote(conversation.id, safe='')}" if conversation else ""
    return AssistantPage(
        portal=portal,
        service_up=service_up,
        start_hint=None if service_up else hint,
        conversation=_conversation(conversation) if conversation else None,
        items=items,
        full_page=f"/chat{query}",
    )
