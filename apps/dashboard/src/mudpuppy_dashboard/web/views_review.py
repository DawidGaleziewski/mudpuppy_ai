"""Review's calls to the chat service for the portal model (spec 040: decide, undo, Also settles),
shared by the Review router; the dashboard never writes the store itself."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .. import chat_client


async def model_call(
    web: Any, env: str, portal: str, verb: str, body: dict[str, Any]
) -> tuple[str | None, dict[str, Any]]:
    return await chat_client.model_call(
        web.settings, web.chat_transport, chat_client.ModelCall(env, portal, verb, body)
    )


@dataclass(frozen=True)
class Confirmed:
    """A confirm just recorded: the keys it decided, its reason, the pairs it also settles."""

    keys: list[str]
    reason: str
    pairs: list[str]


async def also_settle(web: Any, env: str, portal: str, done: Confirmed) -> str:
    """Also settles (designer § 5.5): each linked Same screen? pair (`a:b`) answered "Same
    screen", with the confirm's reason. Undo takes back the decision, not these answers."""
    settled = 0
    for pair in done.pairs:
        a, _, b = pair.partition(":")
        if not (a and b):
            continue
        why = f"{done.reason or 'Confirmed in Review.'} (with {', '.join(done.keys)})"
        body = {"a": a, "b": b, "answer": "same", "by": web.settings.reviewer, "reason": why}
        refused, _ = await model_call(web, env, portal, "label", body)
        settled += refused is None
    if not done.pairs:
        return ""
    return f" Also settled {settled} of {len(done.pairs)} Same screen? pairs."
