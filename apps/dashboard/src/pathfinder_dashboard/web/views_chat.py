"""What the chat page and its fragments need (spec 010, R-30), built once for page and fragment."""

from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from .. import live_map, queries_chat, queries_proposals
from ..models import ChatMessage
from ..queries_proposals import ProposalView
from .deps import Ctx

# A running run with no recorded activity for this long is called out in the chat (T047, F-22).
QUIET_WARN_MS = 5 * 60_000


# The chat service's history lines for a credential request and its answer (ui-actions.ts
# credentialLine, api.ts): names only, never a value.
CREDENTIAL_NEEDED = re.compile(
    r"^Credential needed: ([A-Z][A-Z0-9_]{0,63}) · (\S+) · (sandbox|staging|production) · (\S+)\."
    r"(?: (.*))?$",
    re.DOTALL,
)
CREDENTIAL_STORED = re.compile(r"^Stored in the vault: ([A-Z0-9_, ]+) \((\S+) · (\S+)\)\.")


@dataclass(frozen=True)
class CredentialRequest:
    """The assistant asked for a credential (spec 022 FE-A05); the card is a vault field."""

    message: ChatMessage
    ref: str
    portal: str
    environment: str
    persona: str
    reason: str | None
    stored: bool


def _stored_refs(messages: list[ChatMessage]) -> set[tuple[str, str, str]]:
    found = set()
    for m in messages:
        hit = m.tool_name == "credential_stored" and CREDENTIAL_STORED.match(m.content)
        if hit:
            found |= {(hit[2], hit[3], ref.strip()) for ref in hit[1].split(",")}
    return found


def _entry(m: ChatMessage, stored: set[tuple[str, str, str]]) -> tuple[str, Any]:
    hit = m.tool_name == "request_credential" and CREDENTIAL_NEEDED.match(m.content)
    if not hit:
        return ("message", m)
    ref, portal, env, persona, reason = hit.groups()
    done = (portal, env, ref) in stored
    return ("credential", CredentialRequest(m, ref, portal, env, persona, reason, done))


def timeline(messages: list[ChatMessage], proposals: list[ProposalView]) -> list[tuple[str, Any]]:
    """Messages, credential requests and the assistant's proposals in time order (spec 022
    FE-A04, FE-A05): a proposal sits after the message it was made during."""
    stored = _stored_refs(messages)
    entries: list[tuple[str, str, Any]] = [(m.created_at, *_entry(m, stored)) for m in messages]
    entries += [(v.p.created_at, "proposal", v) for v in proposals]
    return [(kind, item) for _, kind, item in sorted(entries, key=lambda e: e[0])]


def chat_values(
    c: Ctx, conn: sqlite3.Connection, conversation_id: str | None
) -> dict[str, Any] | None:
    """Newest active conversation, or the one asked for; None when that id does not exist."""
    conversation = (
        queries_chat.get_conversation(conn, conversation_id)
        if conversation_id
        else queries_chat.newest_active_conversation(conn, c.portal)  # spec 011
    )
    if conversation is None:
        return None if conversation_id else {"conversation": None}
    tracker = queries_chat.tracker(conn, conversation)
    progress = queries_chat.progress(conn, tracker)
    now = datetime.now(UTC)
    messages = queries_chat.list_messages(conn, conversation.id)
    return {
        "conversation": conversation,
        "messages": messages,
        "timeline": timeline(messages, queries_proposals.for_conversation(conn, conversation.id)),
        "tracker": tracker,
        "superseded": queries_chat.superseded_counts(conn).get(tracker.portal_id or "", 0),
        # T047: the run's counters and activity feed, timed on the server (reload-safe)
        "progress": progress,
        "elapsed_ms": progress.elapsed_ms(now) if progress else None,
        "quiet_ms": progress.quiet_ms(now) if progress else None,
        "quiet_warn_ms": QUIET_WARN_MS,
    }


def tools_values(
    c: Ctx, conn: sqlite3.Connection, conversation: Any, portal: str | None
) -> dict[str, Any]:
    """The credentials form and the scope checklist beside the chat (T020, T027)."""
    return {
        "tools": {
            "portal": portal,
            "states": queries_chat.portal_states(conn, portal),
            "personas": queries_chat.list_personas(c.settings.personas_dir, portal),
            "environments": queries_chat.ENVIRONMENTS,
            "self_url": c.url("/fragments/chat/tools", conversation=conversation.id),
        }
    }


def map_values(c: Ctx, conn: sqlite3.Connection, values: dict[str, Any]) -> dict[str, Any]:
    """T049: the live map of the conversation's run; `map_version` also covers the status,
    so the map renders once more when the run ends (and stops polling)."""
    progress = values.get("progress")
    live = live_map.run_map(conn, progress.run_id, datetime.now(UTC)) if progress else None
    version = f"{live.version}-{progress.status}" if live and progress else ""
    return {"live_map": live, "map_version": version}
