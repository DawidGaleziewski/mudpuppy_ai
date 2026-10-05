"""Per-session rate limit (LO-41): more than 30 requests in a sliding second → 429."""

import time
from collections import deque
from collections.abc import Callable

from django.http import HttpRequest, HttpResponse

from .store import STORE

LIMIT = 30
WINDOW_S = 1.0
EXEMPT = ("/healthz", "/__admin/reset")
# Static assets a single page load pulls in bulk (bundles, CMS files, widget frames, legacy
# images) are not counted: only pages and API calls are, as on a portal behind a CDN.
EXEMPT_PREFIXES = ("/mfe/", "/cms/", "/widget/", "/legacy/static/", "/api/bank/ticker")


def middleware(get_response: Callable[[HttpRequest], HttpResponse]):
    def handle(request: HttpRequest) -> HttpResponse:
        if request.path in EXEMPT or request.path.startswith(EXEMPT_PREFIXES):
            return get_response(request)
        sid = request.pg_session.id  # type: ignore[attr-defined]
        now = time.monotonic()
        with STORE.lock:
            hits = STORE.data.setdefault("rate", {}).setdefault(sid, deque())
            while hits and now - hits[0] > WINDOW_S:
                hits.popleft()
            hits.append(now)
            over = len(hits) > LIMIT
        if over:
            response = HttpResponse(
                "Zbyt wiele żądań", status=429, content_type="text/plain; charset=utf-8"
            )
            response["Retry-After"] = "1"
            return response
        return get_response(request)

    return handle
