"""Shared endpoints: health, robots, reset, clock, CMS, import map, bundles, the shell page."""

import json
import mimetypes
import time
from collections.abc import Callable

from django.http import (
    FileResponse,
    Http404,
    HttpRequest,
    HttpResponse,
    HttpResponseNotAllowed,
    JsonResponse,
)
from django.views.decorators.csrf import csrf_exempt

from . import config
from .store import STORE

# The estate's fixed "today" (LO-50): every date rule is judged against it, never the real date.
TODAY = "2026-03-16"

# Front-end apps by import-map name → their workspace folder under web/.
APPS = {
    "shell": "shell",
    "shop": "mfe-shop",
    "bank": "mfe-bank",
    "insurer": "mfe-insurer",
    "cookies": "mfe-cookies",
}

CMS_DOMAINS = {"shell", "shop", "bank", "insurer"}


def healthz(request: HttpRequest) -> HttpResponse:
    return HttpResponse("ok", content_type="text/plain")


def robots(request: HttpRequest) -> HttpResponse:
    return HttpResponse("User-agent: *\nDisallow: /__admin/\n", content_type="text/plain")


@csrf_exempt
def reset(request: HttpRequest) -> HttpResponse:
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    STORE.reset()
    return JsonResponse({"reset": True})


def clock(request: HttpRequest) -> JsonResponse:
    return JsonResponse({"today": TODAY})


def cms(request: HttpRequest, domain: str, lang: str) -> HttpResponse:
    """CMS texts as a file, slowed down so keys could flash before texts arrive (LO-07)."""
    if domain not in CMS_DOMAINS or lang != "pl":
        raise Http404("no such CMS file")
    path = config.CONFIG.root / "cms" / domain / f"{lang}.json"
    if not path.exists():
        raise Http404("no such CMS file")
    time.sleep(config.CONFIG.cms_delay_ms / 1000)
    return HttpResponse(path.read_bytes(), content_type="application/json; charset=utf-8")


def import_map(request: HttpRequest) -> JsonResponse:
    return JsonResponse({name: f"/mfe/{name}/index.js" for name in APPS if name != "shell"})


BUNDLE_DELAY_COOKIE = "pg_bundle_delay_ms"
BUNDLE_DELAY_MAX_MS = 10_000


def _bundle_delay_ms(request: HttpRequest) -> int:
    """The opt-in test delay of the cookie; anything outside 0..10000 or not a number is ignored."""
    raw = request.COOKIES.get(BUNDLE_DELAY_COOKIE, "")
    if not raw.isdigit():
        return 0
    ms = int(raw)
    return ms if 0 <= ms <= BUNDLE_DELAY_MAX_MS else 0


def bundle_delay(request: HttpRequest) -> HttpResponse:
    """Test-only: set the cookie that slows micro-frontend bundles (LO-02). Nothing links here."""
    response = HttpResponse("ok", content_type="text/html; charset=utf-8")
    response.set_cookie(BUNDLE_DELAY_COOKIE, request.GET.get("ms", "0"), path="/")
    return response


def bundle(request: HttpRequest, name: str, file: str) -> HttpResponse:
    folder = APPS.get(name)
    if folder is None or ".." in file:
        raise Http404("no such bundle")
    if name != "shell":
        time.sleep(_bundle_delay_ms(request) / 1000)
    path = config.CONFIG.root / "web" / folder / "dist" / file
    if not path.is_file():
        raise Http404("bundle not built; run pnpm --dir apps/proving-ground build")
    ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    if path.suffix == ".js":
        ctype = "text/javascript"
    return FileResponse(path.open("rb"), content_type=ctype)


SHELL_HTML = """<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Grupa Mokradło</title>
<link rel="icon" href="data:,">
</head>
<body>
<div id="pg-root"></div>
<script type="module">
import { boot } from "/mfe/shell/index.js";
boot(document.getElementById("pg-root"), %s);
</script>
</body>
</html>
"""


def shell_page(request: HttpRequest, *_route_groups: object, **_kw: object) -> HttpResponse:
    """Every modern route renders the same shell document; the shell routes on the client."""
    boot = {"widgetOrigin": config.CONFIG.widget_origin}
    return HttpResponse(SHELL_HTML % json.dumps(boot), content_type="text/html; charset=utf-8")


def widget_port_guard(get_response: Callable[[HttpRequest], HttpResponse]):
    """The widget port is a separate origin that serves ``/widget/*`` only (LO-03)."""

    def handle(request: HttpRequest) -> HttpResponse:
        on_widget_port = request.META.get("SERVER_PORT") == str(config.CONFIG.widget_port)
        if on_widget_port != request.path.startswith("/widget/"):
            raise Http404("not served on this port")
        response = get_response(request)
        if on_widget_port:
            # The widgets are framed by the estate's pages on the main port.
            response["Access-Control-Allow-Origin"] = f"http://127.0.0.1:{config.CONFIG.port}"
            response["Access-Control-Allow-Credentials"] = "true"
        return response

    return handle
