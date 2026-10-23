"""The React console's Business rules (R-96, spec 065; designer screens v2-11 and v2-12): the
list, one rule, the rule as the export has it, and Reword (spec 040 FR-007) through the chat
service, signed with the reviewer. Run the rule tests is `…/check-runs` (`web/api_processes.py`).
No SQL here (G-15)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse, Response

from .. import chat_client, queries_app_rules, rules_export
from .api_common import known_portal, store
from .chat_forward import read_json
from .chat_writes import WriteResult, write_answer, write_refused
from .deps import web_of

router = APIRouter(prefix="/api/portals/{portal}/rules")


def _exported(request: Request, portal: str, env: str | None) -> rules_export.RulesExport:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        return rules_export.export(web.settings, c.data_dir, c.env, portal)
    except rules_export.ExportFailed as err:
        raise HTTPException(404, f"No export: {err}") from err


# Before `/{key}`: `export.zip` is not a rule's key.
@router.get("/export.zip", response_model=None)
def rules_zip(request: Request, portal: str, env: str | None = None) -> Response:
    """Every rule as DMN and Markdown, `rules.csv` and the README (owner answer OV-5)."""
    top = f"{portal}-rules"
    return Response(
        _exported(request, portal, env).zip_bytes(top),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{top}.zip"'},
    )


@router.get("/export/{name}", response_model=None)
def rules_file(request: Request, portal: str, name: str, env: str | None = None) -> Response:
    """One file of the export: a rule's `.md` or `.dmn`, `rules.csv` or the README."""
    path = _exported(request, portal, env).file(name)
    if path is None:
        raise HTTPException(404, f"There is no file {name} in the rules export.")
    media = rules_export.MEDIA.get(path.suffix, "text/plain")
    return FileResponse(path, media_type=media, filename=f"{portal}-{name}")


@router.get("")
def rules_page(
    request: Request, portal: str, env: str | None = None, status: str | None = None
) -> queries_app_rules.RulesPage:
    web = web_of(request)
    c = web.ctx(request, env)
    known_portal(web, c, portal)
    with store(c) as conn:
        return queries_app_rules.rules_page(conn, portal, status, bool(web.settings.reviewer))


@router.get("/{key}")
def rule_page(
    request: Request, portal: str, key: str, env: str | None = None
) -> queries_app_rules.RulePage:
    web = web_of(request)
    c = web.ctx(request, env)
    known_portal(web, c, portal)
    with store(c) as conn:
        page = queries_app_rules.rule_page(conn, portal, key, bool(web.settings.reviewer))
    if page is None:
        raise HTTPException(404, f"There is no rule {key} in {portal}.")
    return page


@router.get("/{key}/export")
async def rule_export(
    request: Request, portal: str, key: str, env: str | None = None
) -> queries_app_rules.RuleExport:
    """The rule's Markdown in the export (owner answer OV-5); the export is built by a command,
    so the page asks for it after it shows."""
    web = web_of(request)
    c = web.ctx(request, env)
    known_portal(web, c, portal)
    try:
        built = await run_in_threadpool(
            rules_export.export, web.settings, c.data_dir, c.env, portal
        )
    except rules_export.ExportFailed as err:
        return queries_app_rules.RuleExport(markdown=None, error=str(err))
    return queries_app_rules.RuleExport(markdown=built.markdown(key), error=None)


@router.post("/{key}/reword", response_model=WriteResult)
async def reword(request: Request, portal: str, key: str) -> JSONResponse:
    """A person's sentence for the rule, in place of the mined one in the documentation and the
    export. `key` is the rule's hypothesis key (H-nnnn)."""
    if (no := write_refused(request, "reword rules")) is not None:
        return no
    form = await read_json(request)
    wording = str(form.get("wording") or "").strip()
    reason = str(form.get("reason") or "").strip()
    if not wording:
        return write_answer(422, "A wording needs a sentence.")
    web = web_of(request)
    c = web.ctx(request, None)
    body = {"key": key, "wording": wording, "by": web.settings.reviewer}
    if reason:
        body["reason"] = reason
    refused, _ = await chat_client.model_call(
        web.settings, web.chat_transport, chat_client.ModelCall(c.env, portal, "reword", body)
    )
    if refused:
        return write_answer(502, f"Not recorded: {refused}.")
    return write_answer(200, "Reworded. The export uses it now.")
