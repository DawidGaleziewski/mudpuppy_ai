"""Review's calls to the chat service for the portal model (spec 040: decide, undo, Also settles),
shared by the Review router; the dashboard never writes the store itself."""

from __future__ import annotations

from typing import Any

from .. import chat_client


async def model_call(
    web: Any, env: str, portal: str, verb: str, body: dict[str, Any]
) -> tuple[str | None, dict[str, Any]]:
    return await chat_client.model_call(web.settings, web.chat_transport, env, portal, verb, body)


async def also_settle(
    web: Any, env: str, portal: str, pairs: list[str], keys: list[str], reason: str
) -> str:
    """Also settles (designer § 5.5): each linked Same screen? pair (`a:b`) answered "Same
    screen", with the confirm's reason. Undo takes back the decision, not these answers."""
    settled = 0
    for pair in pairs:
        a, _, b = pair.partition(":")
        if not (a and b):
            continue
        why = f"{reason or 'Confirmed in Review.'} (with {', '.join(keys)})"
        body = {"a": a, "b": b, "answer": "same", "by": web.settings.reviewer, "reason": why}
        refused, _ = await model_call(web, env, portal, "label", body)
        settled += refused is None
    if not pairs:
        return ""
    return f" Also settled {settled} of {len(pairs)} Same screen? pairs."
