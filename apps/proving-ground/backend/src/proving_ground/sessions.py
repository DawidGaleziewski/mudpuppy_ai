"""Server-side sessions with an idle timeout (LO-32).

The cookie ``PGSESSID`` carries a random id; everything else lives in ``STORE.data["sessions"]``.
The same id appears in legacy URLs as ``;jsessionid=`` (LO-24). A logged-in session that sits
idle past the timeout loses its user and is marked ``expired`` so the shell can say so.
"""

import secrets
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from django.http import HttpRequest, HttpResponse

from . import config
from .store import STORE

COOKIE = "PGSESSID"


@dataclass
class Session:
    id: str
    user: str | None = None
    brand: str | None = None
    last_seen: float = field(default_factory=time.monotonic)
    expired: bool = False
    csrf: str = field(default_factory=lambda: secrets.token_urlsafe(16))
    captcha_required: bool = False
    extra: dict[str, Any] = field(default_factory=dict)

    def expires_in(self) -> int | None:
        if self.user is None:
            return None
        left = config.CONFIG.session_timeout_s - (time.monotonic() - self.last_seen)
        return max(0, int(left))


def _registry() -> dict[str, Session]:
    return STORE.data["sessions"]


def lookup(sid: str | None) -> Session | None:
    if not sid:
        return None
    with STORE.lock:
        s = _registry().get(sid)
        if s is None:
            return None
        if s.user is not None and time.monotonic() - s.last_seen > config.CONFIG.session_timeout_s:
            s.user = None
            s.brand = None
            s.expired = True
        return s


def create() -> Session:
    with STORE.lock:
        s = Session(id=secrets.token_hex(16))
        _registry()[s.id] = s
        return s


def sid_from(request: HttpRequest) -> str | None:
    """Cookie first; legacy URLs may carry ``;jsessionid=<sid>`` instead (LO-24)."""
    sid = request.COOKIES.get(COOKIE)
    if sid:
        return sid
    marker = ";jsessionid="
    if marker in request.path:
        return request.path.split(marker, 1)[1].split("/", 1)[0].split("?", 1)[0]
    return None


def middleware(get_response: Callable[[HttpRequest], HttpResponse]):
    """Attach ``request.pg_session`` (created on demand), touch it, set the cookie."""

    def handle(request: HttpRequest) -> HttpResponse:
        s = lookup(sid_from(request))
        fresh = s is None
        if s is None:
            s = create()
        # Polling the session state must not keep a session alive.
        if s.user is not None and request.path != "/api/session":
            s.last_seen = time.monotonic()
        request.pg_session = s  # type: ignore[attr-defined]
        response = get_response(request)
        if fresh or request.COOKIES.get(COOKIE) != s.id:
            response.set_cookie(COOKIE, s.id, httponly=True, samesite="Lax", path="/")
        return response

    return handle
