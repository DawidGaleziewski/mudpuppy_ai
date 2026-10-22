"""Settings ▸ Hints and Budgets edited from the page (spec 040 T021, 12-v2-ux § 10, UX-R80–R81;
spec 039 F-54). The chat service writes the portal file (`PUT /portals/{p}/hints`, checked by the
portal schema, the file put back when it would not load); these routes only forward a form post
and come back to Settings with the outcome."""

from __future__ import annotations

from urllib.parse import parse_qs, quote

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse, RedirectResponse, Response

from .. import chat_client
from .deps import same_origin, web_of

router = APIRouter()


def _lines(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.strip()]


def _flag(line: str) -> dict[str, str]:
    """`cookie ab_calc` · `storage exp.hero` · a bare name is a cookie."""
    kind, _, name = line.partition(" ")
    if kind in ("cookie", "storage") and name.strip():
        return {"kind": kind, "name": name.strip()}
    return {"kind": "cookie", "name": line}


def _number(value: str) -> int | None:
    return int(value) if value.strip().isdigit() else None


def hints_body(form: dict[str, list[str]], part: str) -> dict[str, object] | None:
    """The chat service's body for one plate's form (`hints` or `budgets`); None: not a number."""
    one = {k: (v or [""])[0] for k, v in form.items()}
    if part == "budgets":
        checks, step, scan = (
            _number(one.get(k, ""))
            for k in ("checks_per_scan", "probes_per_step", "probes_per_scan")
        )
        if checks is None or step is None or scan is None:
            return None
        return {"replay_budget": checks, "probes": {"per_step": step, "per_run": scan}}
    return {
        "release_marker": {
            "header": one.get("marker_header", "").strip(),
            "meta": one.get("marker_meta", "").strip(),
        },
        "experiment_flags": [_flag(x) for x in _lines(one.get("ab_flags", ""))],
        "business_errors": _lines(one.get("refusals", "")),
    }


@router.post("/portals/{portal}/hints/{part}", response_model=None)
async def portal_hints(
    request: Request, portal: str, part: str, env: str | None = None
) -> Response:
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    form = parse_qs((await request.body()).decode("utf-8", "replace"), keep_blank_values=True)
    body = hints_body(form, part) if part in ("hints", "budgets") else None
    word = "Budgets" if part == "budgets" else "Hints"
    if body is None:
        note = f"{word} not saved: each budget is a whole number, 0 or more."
    else:
        try:
            code, answer = await chat_client.call(
                web.settings,
                "PUT",
                f"/portals/{quote(portal, safe='')}/hints",
                body,
                web.chat_transport,
            )
        except chat_client.ChatUnavailable:
            note = f"{word} not saved: {chat_client.not_running(c.env)}"
        else:
            message = answer.get("message") if isinstance(answer, dict) else None
            note = f"{word} saved." if code == 200 else f"{word} not saved: {message or code}."
    anchor = "budgets" if part == "budgets" else "hints"
    target = c.url(f"/portals/{quote(portal, safe='')}/settings", hints_note=note)
    return RedirectResponse(f"{target}#{anchor}", status_code=303)
