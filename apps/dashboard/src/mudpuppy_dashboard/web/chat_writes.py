"""The writes the console asks the chat service for (spec 034 R-66, spec 054), shared by the htmx
routers (`states`, `plan`) and the React console's `api_writes` so both send the same calls: a
mark set or removed on the portal's marks, and a scan request posted to the portal's
conversation. The dashboard never writes the store itself. Not a router (G-13)."""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import quote

from .. import chat_client, queries_map_node, queries_plan

SCAN_TYPES = (
    ("focused", "Focused", "Replays to the Start here and Focus marks and explores from there."),
    ("recheck", "Recheck", "Replays to the Recheck marks and records what each shows now."),
    ("retry", "Retry a path", "Replays to a failed action and tries it again, with a variation."),
    ("continue", "Continue a stopped scan", "Picks up where a stopped scan left off."),
)
TYPE_LABELS = {t: label for t, label, _ in SCAN_TYPES}
VARIATIONS = queries_plan.VARIATIONS
SCREEN_MARK_KINDS = {kind: label for kind, label, _ in queries_map_node.SCREEN_MARKS}
PROBE_MARK_DONE = {
    "mark": "Marked for probing. Ask the assistant to probe the marked forms.",
    "remove": "Probe mark removed.",
}


async def mark_call(
    web: Any, env: str, method: str, portal: str, body: dict[str, Any]
) -> str | None:
    """One chat service call on the portal's marks; the refusal's message, or None."""
    path = f"/portals/{quote(portal, safe='')}/marks"
    try:
        status, answer = await chat_client.call(
            web.settings, method, path, body, web.chat_transport
        )
    except chat_client.ChatUnavailable:
        return chat_client.not_running(env)
    if status in (200, 201):
        return None
    message = answer.get("message") if isinstance(answer, dict) else None
    return str(message or status)


def scan_request_text(
    portal: str, persona: str, environment: str | None, run_type: str, plan: dict[str, Any]
) -> str:
    """The chat message a "Start scan" sends: precise enough that the assistant makes exactly
    this `request_scan` call."""
    where = f" in environment “{environment}”" if environment else ""
    args = {"portal": portal, "persona": persona, "run_type": run_type, "plan": plan}
    if environment:
        args["environment"] = environment
    return (
        f"Start a {TYPE_LABELS[run_type].lower()} scan of {portal} as {persona}{where}, as planned "
        f"on the Plan next scan page: call request_scan with {json.dumps(args)} and start the "
        "crawler with the hand-off."
    )


def plan_from_form(run_type: str, form: dict[str, str]) -> dict[str, Any] | None:
    """The `plan` for the type, or None when the form misses what the type needs."""
    plan: dict[str, Any] = {}
    if run_type == "focused":
        depth = form.get("depth", "2")
        plan["depth"] = int(depth) if depth.isdigit() and int(depth) <= 10 else 2
    if run_type in ("continue", "retry") and form.get("parent_run_id"):
        plan["parent_run_id"] = form["parent_run_id"]
    if run_type == "retry":
        if form.get("target_transition_id"):
            plan["target_transition_id"] = form["target_transition_id"]
        variation = form.get("variation", "none")
        plan["variation"] = variation if variation in dict(VARIATIONS) else "none"
    if run_type == "continue" and "parent_run_id" not in plan:
        return None
    return plan


async def send_to_chat(web: Any, env: str, portal: str, text: str) -> tuple[str | None, str | None]:
    """Post the request to the portal's conversation: (conversation id, refusal message)."""
    try:
        status, body = await chat_client.call(
            web.settings, "POST", "/conversations", {"portal": portal}, web.chat_transport
        )
        conv = body.get("id") if isinstance(body, dict) else None
        if status >= 300 or not isinstance(conv, str):
            return None, "the chat service did not open a conversation"
        status, body = await chat_client.call(
            web.settings,
            "POST",
            f"/conversations/{quote(conv, safe='')}/messages",
            {"text": text},
            web.chat_transport,
        )
    except chat_client.ChatUnavailable:
        return None, chat_client.not_running(env)
    if status >= 300:
        message = body.get("message") if isinstance(body, dict) else None
        return conv, str(message or status)
    return conv, None
