"""The React console's process scope and merge writes (spec 078; designer T-05, T-06): Add to
process (a scope change: A follows what scans saw) and its Undo; merging two saved processes, its
dry run (the dialog's facts, computed by the server for the chosen pair) and its Undo / Split back.
Every write is a chat service call, signed with the reviewer. No SQL here (G-15)."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .chat_forward import read_json
from .chat_writes import WriteResult, chat_write, write_answer, write_refused
from .deps import web_of

router = APIRouter(prefix="/api/portals/{portal}")

WHAT = "change processes"


def _ids(value: object) -> list[str]:
    return [v for v in value if isinstance(v, str) and v] if isinstance(value, list) else []


async def _call(
    request: Request, portal: str, rest: str, body: dict[str, Any]
) -> tuple[int, dict[str, Any]]:
    web = web_of(request)
    c = web.ctx(request, None)
    path = f"/portals/{quote(portal, safe='')}/{rest}"
    return await chat_write(web, c.env, "POST", path, {**body, "author": web.settings.reviewer})


def _failed(status: int, answer: dict[str, Any]) -> JSONResponse:
    message = answer.get("message") or f"the chat service answered {status}"
    return write_answer(409 if status == 409 else 502, f"Not done: {message}.")


def _added_message(answer: dict[str, Any], name: str) -> str:
    """ "Kontakt added to Napisz do nas · its as-is follows what scans saw" (designer T-05)."""
    added = [a for a in answer.get("added", []) if isinstance(a, dict)]
    on = [str(a.get("title") or a.get("state_id")) for a in added if a.get("on_path")]
    off = [str(a.get("title") or a.get("state_id")) for a in added if not a.get("on_path")]
    parts = []
    if on:
        parts.append(f"{', '.join(on)} added to {name} · its as-is follows what scans saw")
    if off:
        parts.append(f"{', '.join(off)} added to {name}'s scope · not on the observed path yet")
    return "; ".join(parts) or f"Nothing new for {name}."


def _process_href(portal: str, answer: dict[str, Any]) -> str | None:
    process = answer.get("process")
    key = process.get("key") if isinstance(process, dict) else None
    return (
        f"/app/portals/{quote(portal, safe='')}/processes/{quote(key, safe='')}"
        if isinstance(key, str)
        else None
    )


@router.post("/processes/{process}/scope", response_model=WriteResult)
async def add_to_scope(request: Request, portal: str, process: str) -> JSONResponse:
    """Add to process (`state_ids`): a scope change; Undo takes the same screens out again."""
    if (no := write_refused(request, WHAT)) is not None:
        return no
    states = _ids((await read_json(request)).get("state_ids"))
    if not states:
        return write_answer(422, "Pick at least one screen to add.")
    status, answer = await _call(
        request, portal, f"processes/{quote(process, safe='')}/scope", {"state_ids": states}
    )
    if status != 200:
        return _failed(status, answer)
    proc = answer.get("process") if isinstance(answer.get("process"), dict) else {}
    name = str(proc.get("name") or "the process")
    return write_answer(
        200, _added_message(answer, name), _process_href(portal, answer), undo=",".join(states)
    )


@router.post("/processes/{process}/scope/remove", response_model=WriteResult)
async def remove_from_scope(request: Request, portal: str, process: str) -> JSONResponse:
    """Undo of Add to process: the screens leave the scope and the A revision they caused."""
    if (no := write_refused(request, WHAT)) is not None:
        return no
    states = _ids((await read_json(request)).get("state_ids"))
    if not states:
        return write_answer(422, "Name the screens to take out.")
    status, answer = await _call(
        request, portal, f"processes/{quote(process, safe='')}/scope/remove", {"state_ids": states}
    )
    if status != 200:
        return _failed(status, answer)
    return write_answer(
        200, "Undone: the screens left the process's scope.", _process_href(portal, answer)
    )


MERGE_KEYS = ("keep", "absorb", "name", "start", "end", "reason")


@router.post("/processes/merge")
async def merge(request: Request, portal: str) -> JSONResponse:
    """Merge two saved processes (`keep`, `absorb`, `name`, `start`, `end`, `reason`). With
    `dry_run` the answer is the plan the dialog shows; else the merge, with its Undo."""
    if (no := write_refused(request, WHAT)) is not None:
        return no
    form = await read_json(request)
    if not form.get("keep") or not form.get("absorb"):
        return write_answer(422, "Pick the two processes to merge.")
    body = {k: form[k] for k in MERGE_KEYS if form.get(k)} | {
        "dry_run": form.get("dry_run") is True
    }
    status, answer = await _call(request, portal, "processes/merge", body)
    if status != 200:
        return _failed(status, answer)
    if body["dry_run"]:
        return JSONResponse(
            {"ok": True, "plan": answer.get("plan")}, headers={"Cache-Control": "no-store"}
        )
    row = answer.get("merge") if isinstance(answer.get("merge"), dict) else {}
    proc = answer.get("process") if isinstance(answer.get("process"), dict) else {}
    kept = f"{proc.get('key', '')} {proc.get('name', '')}"
    done = f"Merged into {kept}: Undo for 10 s, or Split back later in History."
    return write_answer(
        200, done, _process_href(portal, answer), undo=str(row.get("id") or "") or None
    )


@router.post("/merges/{merge_id}/undo", response_model=WriteResult)
async def undo_merge(request: Request, portal: str, merge_id: str) -> JSONResponse:
    """Undo a merge or Split back later: both processes as they were, the absorbed one's to-be
    models as they are now."""
    if (no := write_refused(request, WHAT)) is not None:
        return no
    status, answer = await _call(request, portal, f"merges/{quote(merge_id, safe='')}/undo", {})
    if status != 200:
        return _failed(status, answer)
    back = answer.get("absorbed") if isinstance(answer.get("absorbed"), dict) else {}
    return write_answer(
        200,
        f"Split back: {back.get('key', 'the other process')} is its own process again.",
        _process_href(portal, answer),
    )
