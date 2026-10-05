"""Login, lockout, CAPTCHA after a failure, logout, route protection (LO-30/31/32/37).

The login form is a classic form POST (the shell renders it). Outcomes are redirects:
success → ``next``; failure → back to ``/logowanie`` with ``blad=<reason>``, which the shell shows
with CMS texts. Lockout is per user and survives sessions until ``/__admin/reset``.
"""

import secrets
import time
from collections.abc import Callable
from functools import wraps
from urllib.parse import urlencode

from django.contrib.auth.hashers import check_password
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect, JsonResponse
from django.views.decorators.csrf import csrf_exempt

from . import captcha
from .sessions import Session
from .store import STORE

BRANDS = ("shop", "bank", "insurer")
MAX_FAILURES = 3

View = Callable[..., HttpResponse]


def session_of(request: HttpRequest) -> Session:
    return request.pg_session  # type: ignore[attr-defined]


def _safe_next(value: str | None, brand: str) -> str:
    default = {"shop": "/sklep/konto", "bank": "/bank/pulpit", "insurer": "/ubezpieczenia#/polisy"}
    if value and value.startswith("/") and not value.startswith("//"):
        return value
    return default.get(brand, "/")


def login_url(brand: str, next_path: str, error: str | None = None) -> str:
    q = {"marka": brand, "next": next_path}
    if error:
        q["blad"] = error
    return f"/logowanie?{urlencode(q)}"


def login_form(request: HttpRequest) -> JsonResponse:
    """What the shell needs to render the form: CSRF token and whether the CAPTCHA is required."""
    s = session_of(request)
    brand = request.GET.get("marka", "bank")
    return JsonResponse(
        {
            "brand": brand if brand in BRANDS else "bank",
            "csrf": s.csrf,
            "captcha_required": s.captcha_required,
        }
    )


@csrf_exempt  # the estate checks its own token (contracts/estate.md), not Django's
def login(request: HttpRequest) -> HttpResponse:
    if request.method != "POST":
        return JsonResponse({"error": "method"}, status=405)
    s = session_of(request)
    brand = request.POST.get("marka", "bank")
    if brand not in BRANDS:
        brand = "bank"
    nxt = _safe_next(request.POST.get("next"), brand)

    def fail(reason: str) -> HttpResponse:
        return HttpResponseRedirect(login_url(brand, nxt, reason))

    if not secrets.compare_digest(request.POST.get("csrf", ""), s.csrf):
        return fail("csrf")
    if s.captcha_required and not captcha.verify(s, request.POST.get("g-recaptcha-response", "")):
        return fail("captcha")
    name = request.POST.get("login", "").strip()
    with STORE.lock:
        failures = STORE.data["failed_logins"]
        if failures.get(name, 0) >= MAX_FAILURES:
            return fail("locked")
        user = STORE.user_by_login(name)
        ok = (
            user is not None
            and user["brand"] == brand
            and check_password(request.POST.get("haslo", ""), user["hash"])
        )
        if not ok:
            failures[name] = failures.get(name, 0) + 1
            s.captcha_required = True
            return fail("locked" if failures[name] >= MAX_FAILURES else "rejected")
        failures.pop(name, None)
        s.user, s.brand, s.expired, s.captcha_required = user["id"], brand, False, False
        s.csrf = secrets.token_urlsafe(16)
        # The idle clock starts now; a stale stamp would expire the new login at once.
        s.last_seen = time.monotonic()
    return HttpResponseRedirect(nxt)


@csrf_exempt
def logout(request: HttpRequest) -> HttpResponse:
    s = session_of(request)
    s.user, s.brand, s.expired = None, None, False
    return HttpResponseRedirect("/")


def session_info(request: HttpRequest) -> JsonResponse:
    s = session_of(request)
    if s.user is None:
        return JsonResponse({"user": None, "expired": s.expired}, status=401)
    user = STORE.user(s.user) or {}
    return JsonResponse(
        {
            "user": s.user,
            "login": user.get("login"),
            "brand": s.brand,
            "expires_in": s.expires_in(),
            # The legacy app takes the session in its URL (LO-24); wrappers build iframe URLs.
            "legacy_sid": s.id,
        }
    )


def require_api(brand: str) -> Callable[[View], View]:
    """API guard: 401 JSON with ``session_expired`` or ``login_required``."""

    def deco(view: View) -> View:
        @wraps(view)
        def inner(request: HttpRequest, *args, **kwargs) -> HttpResponse:
            s = session_of(request)
            if s.user is None or s.brand != brand:
                code = "session_expired" if s.expired else "login_required"
                return JsonResponse({"error": code, "login": login_url(brand, "/")}, status=401)
            return view(request, *args, **kwargs)

        return inner

    return deco


def require_page(brand: str) -> Callable[[View], View]:
    """Page guard: a full page load without a session redirects to the brand's login."""

    def deco(view: View) -> View:
        @wraps(view)
        def inner(request: HttpRequest, *args, **kwargs) -> HttpResponse:
            s = session_of(request)
            if s.user is None or s.brand != brand:
                return HttpResponseRedirect(login_url(brand, request.get_full_path()))
            return view(request, *args, **kwargs)

        return inner

    return deco
