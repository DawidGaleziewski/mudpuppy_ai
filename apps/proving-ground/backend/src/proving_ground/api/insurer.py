"""Insurer domain: policies, add-ons, the server-held claim wizard and the upload widget.

Obstacles reproduced: LO-28 (PDF download), LO-51 (add-on threshold), LO-47 (server-only date
rule), LO-33 (wizard state lives on the server), LO-03 (cross-origin upload widget).
"""

import html
import json
import re
import secrets
from datetime import date, timedelta

from django.http import HttpRequest, HttpResponse, JsonResponse
from django.urls import path
from django.views.decorators.csrf import csrf_exempt

from proving_ground import config
from proving_ground.auth import require_api, session_of
from proving_ground.estate import TODAY
from proving_ground.store import STORE

BRAND = "insurer"
ASSISTANCE_REASON = "Dostępne dla polis z sumą ubezpieczenia od 50 000 zł"
CLAIM_WINDOW_MESSAGE = "Szkodę można zgłosić do 30 dni od zdarzenia."
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _json_body(request: HttpRequest) -> dict:
    try:
        body = json.loads(request.body or b"{}")
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


def _parse_date(value: object) -> date | None:
    if not isinstance(value, str) or not _DATE.match(value):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _error(code: str, message: str, status: int = 400, **extra: object) -> JsonResponse:
    return JsonResponse({"error": code, "message": message, **extra}, status=status)


def _policy(request: HttpRequest, nr: str) -> dict | None:
    user = session_of(request).user
    with STORE.lock:
        for p in STORE.data["insurer"]["policies"]:
            if p["nr"] == nr and p["owner"] == user:
                return p
    return None


def _public(p: dict) -> dict:
    return {k: v for k, v in p.items() if k != "owner"}


def _not_found() -> JsonResponse:
    return _error("not_found", "Nie znaleziono polisy.", 404)


# ---- policies ---------------------------------------------------------------------------------


@require_api(BRAND)
def policies(request: HttpRequest) -> JsonResponse:
    user = session_of(request).user
    with STORE.lock:
        rows = [_public(p) for p in STORE.data["insurer"]["policies"] if p["owner"] == user]
    return JsonResponse({"policies": rows})


@require_api(BRAND)
def policy_detail(request: HttpRequest, nr: str) -> JsonResponse:
    p = _policy(request, nr)
    return JsonResponse(_public(p)) if p else _not_found()


def _pdf(lines: list[str]) -> bytes:
    text = "BT /F1 14 Tf 50 780 Td " + " ".join(
        f"({ln.encode('ascii', 'replace').decode()}) Tj 0 -20 Td" for ln in lines
    )
    stream = (text + " ET").encode()
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return out


@require_api(BRAND)
def policy_pdf(request: HttpRequest, nr: str) -> HttpResponse:
    p = _policy(request, nr)
    if p is None:
        return _not_found()
    body = _pdf(["Polisa nr " + p["nr"], p["typ"], f"Okres: {p['od']} - {p['do']}"])
    response = HttpResponse(body, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="polisa-{nr}.pdf"'
    return response


# ---- add-ons ----------------------------------------------------------------------------------


@csrf_exempt
@require_api(BRAND)
def addons(request: HttpRequest, nr: str) -> HttpResponse:
    p = _policy(request, nr)
    if p is None:
        return _not_found()
    catalog = STORE.data["insurer"]["addons"]
    if request.method == "GET":
        rows = []
        for a in catalog:
            ok = p["suma"] >= a["min_suma"]
            row = {"id": a["id"], "nazwa": a["nazwa"], "cena": a["cena"], "dostepny": ok}
            if not ok:
                row["powod"] = ASSISTANCE_REASON
            rows.append(row)
        return JsonResponse({"policy": nr, "suma": p["suma"], "addons": rows})
    if request.method != "POST":
        return _error("method", "Niedozwolona metoda.", 405)
    body = _json_body(request)
    addon = next((a for a in catalog if a["id"] == body.get("addon_id")), None)
    if addon is None:
        return _error("unknown_addon", "Nieznany dodatek.")
    if p["suma"] < addon["min_suma"]:
        return _error("addon_unavailable", ASSISTANCE_REASON)
    start = _parse_date(body.get("data_rozpoczecia"))
    if start is None:
        return _error("bad_date", "Podaj datę rozpoczęcia w formacie RRRR-MM-DD.")
    if start < date.fromisoformat(TODAY):
        return _error("date_past", "Data rozpoczęcia nie może być wcześniejsza niż dziś.")
    if start > date.fromisoformat(p["do"]):
        return _error(
            "date_after_end", "Data rozpoczęcia nie może być późniejsza niż koniec polisy."
        )
    with STORE.lock:
        STORE.data["insurer"]["addons_bought"].append(
            {"policy": nr, "addon_id": addon["id"], "start": start.isoformat()}
        )
    return JsonResponse({"ok": True, "policy": nr, "addon_id": addon["id"], "start": str(start)})


# ---- claim wizard (server-held state, LO-33) --------------------------------------------------


def _wizard(request: HttpRequest) -> dict:
    claims = STORE.data["claims"]
    sid = session_of(request).id
    return claims.setdefault(sid, {"step": 1, "data": {}})


def _order_error(w: dict) -> JsonResponse:
    return JsonResponse({"error": "wizard_order", "step": w["step"]}, status=409)


@require_api(BRAND)
def wizard_state(request: HttpRequest) -> JsonResponse:
    with STORE.lock:
        w = _wizard(request)
        return JsonResponse({"step": w["step"], "data": w["data"]})


@csrf_exempt
@require_api(BRAND)
def wizard_reset(request: HttpRequest) -> JsonResponse:
    with STORE.lock:
        STORE.data["claims"].pop(session_of(request).id, None)
    return JsonResponse({"step": 1, "data": {}})


@csrf_exempt
@require_api(BRAND)
def wizard_step1(request: HttpRequest) -> JsonResponse:
    body = _json_body(request)
    with STORE.lock:
        w = _wizard(request)
        if w["step"] != 1:
            return _order_error(w)
        if _policy(request, str(body.get("policy_nr", ""))) is None:
            return _error("bad_policy", "Wybierz polisę.")
        event = _parse_date(body.get("data_zdarzenia"))
        if event is None:
            return _error("bad_date", "Podaj datę zdarzenia w formacie RRRR-MM-DD.")
        today = date.fromisoformat(TODAY)
        window = STORE.data["insurer"]["claim_window_days"]
        if event > today or event < today - timedelta(days=window):
            return _error("date_window", CLAIM_WINDOW_MESSAGE)
        opis = str(body.get("opis", "")).strip()
        if not opis:
            return _error("bad_opis", "Opisz zdarzenie.")
        w["data"].update(
            policy_nr=str(body["policy_nr"]), data_zdarzenia=event.isoformat(), opis=opis
        )
        w["step"] = 2
        return JsonResponse({"step": 2, "data": w["data"]})


@csrf_exempt
@require_api(BRAND)
def wizard_step2(request: HttpRequest) -> JsonResponse:
    body = _json_body(request)
    s = session_of(request)
    with STORE.lock:
        w = _wizard(request)
        if w["step"] != 2:
            return _order_error(w)
        miejsce = str(body.get("miejsce", "")).strip()
        if not miejsce:
            return _error("bad_miejsce", "Podaj miejsce zdarzenia.")
        file_id = body.get("uploaded_file_id")
        if file_id:
            upload = s.extra.get("uploads", {}).get(file_id)
            if upload is None:
                return _error("bad_file", "Nie znaleziono wysłanego pliku.")
            w["data"]["plik"] = {"id": file_id, **upload}
        w["data"]["miejsce"] = miejsce
        w["step"] = 3
        return JsonResponse({"step": 3, "data": w["data"]})


@csrf_exempt
@require_api(BRAND)
def wizard_step3(request: HttpRequest) -> JsonResponse:
    with STORE.lock:
        w = _wizard(request)
        if w["step"] != 3:
            return _order_error(w)
        filed = STORE.data["claims_filed"]
        number = f"SZ/2026/{len(filed) + 1:04d}"
        filed.append({"nr": number, "user": session_of(request).user, **w["data"]})
        STORE.data["claims"].pop(session_of(request).id, None)
    return JsonResponse({"ok": True, "claim_nr": number})


# ---- upload widget (cross-origin, widget port only, LO-03) ------------------------------------

_WIDGET_STYLE = "body{margin:0;font:14px Arial,sans-serif;padding:8px}button{margin-left:8px}"


def _widget_page(body: str) -> HttpResponse:
    doc = (
        '<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Wyślij plik</title>'
        f"<style>{_WIDGET_STYLE}</style></head><body>{body}</body></html>"
    )
    response = HttpResponse(doc, content_type="text/html; charset=utf-8")
    response["Content-Security-Policy"] = f"frame-ancestors http://127.0.0.1:{config.CONFIG.port}"
    return response


@csrf_exempt
def widget_upload(request: HttpRequest) -> HttpResponse:
    if request.method == "POST":
        f = request.FILES.get("plik")
        if f is None:
            return _widget_page('<p>Nie wybrano pliku.</p><a href="upload">Wróć</a>')
        file_id = secrets.token_hex(8)
        s = session_of(request)
        s.extra.setdefault("uploads", {})[file_id] = {"nazwa": f.name, "rozmiar": f.size}
        origin = f"http://127.0.0.1:{config.CONFIG.port}"
        msg = json.dumps({"type": "pg-upload", "file_id": file_id})
        return _widget_page(
            f"<p>Wysłano plik: {html.escape(f.name or '')} ({f.size} B)</p>"
            f"<script>parent.postMessage({msg}, {json.dumps(origin)});</script>"
        )
    return _widget_page(
        '<form method="post" action="upload" enctype="multipart/form-data">'
        '<input type="file" name="plik"><button type="submit">Wyślij plik</button></form>'
    )


urlpatterns = [
    path("api/insurer/policies", policies),
    path("api/insurer/policies/<str:nr>.pdf", policy_pdf),
    path("api/insurer/policies/<str:nr>/addons", addons),
    path("api/insurer/policies/<str:nr>", policy_detail),
    path("api/insurer/claims/wizard", wizard_state),
    path("api/insurer/claims/wizard/reset", wizard_reset),
    path("api/insurer/claims/wizard/step1", wizard_step1),
    path("api/insurer/claims/wizard/step2", wizard_step2),
    path("api/insurer/claims/wizard/step3", wizard_step3),
    path("widget/upload", widget_upload),
]
