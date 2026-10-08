"""What the chat page and its fragments need (spec 010, R-30), built once for page and fragment."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from typing import Any

from .. import live_map, queries_chat
from .deps import Ctx

# A running run with no recorded activity for this long is called out in the chat (T047, F-22).
QUIET_WARN_MS = 5 * 60_000


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
    return {
        "conversation": conversation,
        "messages": queries_chat.list_messages(conn, conversation.id),
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
