"""Redirect chains and meta/JS redirects (LO-21/22/23)."""

from django.http import (
    HttpRequest,
    HttpResponse,
    HttpResponsePermanentRedirect,
    HttpResponseRedirect,
)
from django.urls import re_path


def shop_index(request: HttpRequest) -> HttpResponse:
    cat = request.GET.get("cat", "")
    if not cat.isdigit():
        return HttpResponse("Nieprawidłowa kategoria", status=400)
    return HttpResponsePermanentRedirect(f"/old/kategoria/{cat}")


def old_category(request: HttpRequest, n: str) -> HttpResponse:
    return HttpResponseRedirect(f"/sklep?kategoria={n}")


def policy_php(request: HttpRequest) -> HttpResponse:
    nr = request.GET.get("id", "")
    if not nr.replace("-", "").replace("_", "").isalnum():
        return HttpResponse("Nieprawidłowy numer", status=400)
    html = (
        '<!DOCTYPE html><html><head><meta charset="utf-8">'
        f'<meta http-equiv="refresh" content="1;url=/stare/polisa/{nr}">'
        "<title>Proszę czekać…</title></head><body><p>Proszę czekać…</p></body></html>"
    )
    return HttpResponse(html)


def old_policy(request: HttpRequest, nr: str) -> HttpResponse:
    html = (
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Przekierowanie</title></head>'
        f"<body><script>location.replace('/ubezpieczenia#/polisy/{nr}');</script></body></html>"
    )
    return HttpResponse(html)


urlpatterns = [
    re_path(r"^shop/index\.php$", shop_index),
    re_path(r"^old/kategoria/(?P<n>[0-9]+)$", old_category),
    re_path(r"^polisa\.php$", policy_php),
    re_path(r"^stare/polisa/(?P<nr>[A-Za-z0-9_-]+)$", old_policy),
]
