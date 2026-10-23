"""The React console's Plan next scan and Recover (R-100, spec 071; spec 034 R-66). Start scan
sends one precise request to the portal's conversation through the chat service; Resume, Retry
this path and Skip are the writes in `api_writes`. No SQL here (G-15)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from .. import queries_app_plan
from .api_common import known_portal, store
from .chat_forward import read_json
from .chat_writes import (
    WriteResult,
    assistant_href,
    plan_from_form,
    scan_request_text,
    send_to_chat,
)
from .chat_writes import write_answer as _answer
from .deps import same_origin, web_of

router = APIRouter(prefix="/api")


@router.get("/portals/{portal}/scans/plan")
def plan(request: Request, portal: str, env: str | None = None) -> queries_app_plan.PlanPage:
    """The open marks that pre-fill the next scan (screen 14), the personas and environments."""
    web = web_of(request)
    c = web.ctx(request, env)
    known_portal(web, c, portal)
    with store(c) as conn:
        return queries_app_plan.plan_page(conn, portal)


@router.get("/scans/{scan}/recovery")
def recovery(request: Request, scan: str, env: str | None = None) -> queries_app_plan.RecoverPage:
    """Where and why a scan stopped, its failed actions, the scans started from it (screen 15)."""
    c = web_of(request).ctx(request, env)
    with store(c) as conn:
        r = queries_app_plan.recover_page(conn, scan)
    if r is None:
        raise HTTPException(404, f"There is no scan {scan} in this store.")
    return r


@router.post("/portals/{portal}/scans/plan", response_model=WriteResult)
async def start(request: Request, portal: str, env: str | None = None) -> JSONResponse:
    """Start a planned scan: `run_type` (focused, recheck, retry), `persona`, `environment`,
    `depth` (focused), `variation` (retry)."""
    if not same_origin(request):
        return _answer(403, "Cross-origin request refused.")
    web = web_of(request)
    c = web.ctx(request, env)
    form = {k: str(v) for k, v in (await read_json(request)).items() if v is not None}
    run_type, persona = form.get("run_type", ""), form.get("persona", "").strip()
    if run_type not in dict((t, 1) for t, _, _ in queries_app_plan.SCAN_TYPES) or not persona:
        return _answer(422, "Pick a scan type and a persona first.")
    plan_ = plan_from_form(run_type, form) or {}
    text = scan_request_text(portal, persona, form.get("environment") or None, run_type, plan_)
    _, refused = await send_to_chat(web, c.env, portal, text)
    if refused:
        return _answer(502, f"Not started: {refused}.")
    return _answer(
        200,
        "Sent to the assistant: it starts the scan in the portal's conversation.",
        assistant_href(portal),
    )
