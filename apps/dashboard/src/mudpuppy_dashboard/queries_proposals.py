"""Read model for the assistant's proposals (spec 022 R6, FE-A04): a conversation's proposals with
what they change from, so the drawer can show before → after and disable a stale one. Read-only;
deciding goes through the chat service."""

from __future__ import annotations

import sqlite3
from typing import Any

from pydantic import BaseModel

from .models import ChatProposal


class ProposalView(BaseModel):
    p: ChatProposal
    key: str | None  # the amendment's AMD key (target, or the one applying created)
    head_rev: int | None  # the amendment's current revision
    before_text: str | None  # at base_rev
    before_target: str | None

    @property
    def payload(self) -> dict[str, Any]:
        return self.p.payload if isinstance(self.p.payload, dict) else {}

    @property
    def is_new(self) -> bool:
        return self.p.amendment_id is None

    @property
    def stale(self) -> bool:
        """Stale when marked so, or still open while the amendment moved past its base."""
        if self.p.status == "stale":
            return True
        return (
            self.p.status == "open"
            and not self.is_new
            and self.head_rev is not None
            and self.head_rev != self.p.base_rev
        )

    @property
    def undone(self) -> bool:
        return self.p.status == "discarded" and self.p.applied_rev is not None

    @property
    def next_rev(self) -> int:
        return (self.head_rev or 0) + 1 if not self.is_new else 1


def for_conversation(conn: sqlite3.Connection, conversation_id: str) -> list[ProposalView]:
    """The conversation's proposals, oldest first; empty before migration 0017."""
    return views_of(conn, "p.conversation_id = ?", (conversation_id,))


def views_of(conn: sqlite3.Connection, where: str, args: tuple[Any, ...]) -> list[ProposalView]:
    """Proposals matching `where` (over `chat_proposals p`), oldest first."""
    try:
        rows = conn.execute(
            "SELECT p.*, a.key AS a_key, a.rev AS a_rev, r.text AS r_text, r.target_id AS r_target"
            " FROM chat_proposals p"
            " LEFT JOIN amendments a ON a.id = coalesce(p.amendment_id, p.applied_amendment_id)"
            " LEFT JOIN amendment_revisions_with_target r ON r.amendment_id = p.amendment_id"
            "  AND r.rev = p.base_rev"
            f" WHERE {where} ORDER BY p.created_at, p.id",
            args,
        ).fetchall()
    except sqlite3.OperationalError:
        return []
    views = []
    for row in rows:
        d = dict(row)
        extra = {k: d.pop(k) for k in ("a_key", "a_rev", "r_text", "r_target")}
        views.append(
            ProposalView(
                p=ChatProposal.model_validate(d),
                key=extra["a_key"],
                head_rev=extra["a_rev"],
                before_text=extra["r_text"],
                before_target=extra["r_target"],
            )
        )
    return views
