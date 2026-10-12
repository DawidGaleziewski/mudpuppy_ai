"""Server-rendered legacy app: frames, postbacks, cp1250, dead and broken pages (LO-04..LO-43)."""

import base64
import re
from collections.abc import Callable

from django.http import HttpRequest, HttpResponse, HttpResponseRedirect
from django.template.loader import render_to_string
from django.urls import re_path
from django.views.decorators.csrf import csrf_exempt

from proving_ground.auth import session_of

# The optional servlet-style path parameter every .do URL accepts (LO-24).
JSID = r"(?:;jsessionid=[^/?]*)?"

GIF = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")

OPERATIONS = [
    {"date": "2026-03-02", "title": "Czynsz biuro", "amount": "-2 400,00", "balance": "17 600,00"},
    {
        "date": "2026-03-05",
        "title": "Wpływ od klienta",
        "amount": "+5 000,00",
        "balance": "22 600,00",
    },
    {
        "date": "2026-03-09",
        "title": "Opłata za prowadzenie",
        "amount": "-15,00",
        "balance": "22 585,00",
    },
    {"date": "2026-03-12", "title": "Przelew ZUS", "amount": "-1 380,00", "balance": "21 205,00"},
]

View = Callable[..., HttpResponse]


def _guard(brand: str, next_path: str) -> Callable[[View], View]:
    def deco(view: View) -> View:
        def inner(request: HttpRequest, *args, **kwargs) -> HttpResponse:
            s = session_of(request)
            if s.user is None or s.brand != brand:
                return HttpResponseRedirect(f"/logowanie?marka={brand}&next={next_path}")
            return view(request, *args, **kwargs)

        return inner

    return deco


_bank = _guard("bank", "/bank/historia")
_insurer = _guard("insurer", "/ubezpieczenia")


def _page(template: str, status: int = 200, **ctx) -> HttpResponse:
    return HttpResponse(render_to_string(template, ctx), status=status)


@_bank
def historia(request: HttpRequest, *_a) -> HttpResponse:
    return _page("legacy/frameset.html", sid=session_of(request).id)


@_bank
def menu(request: HttpRequest, *_a) -> HttpResponse:
    return _page(
        "legacy/menu.html", sid=session_of(request).id, viewstate="dDwtMTI4NzY1NDMyMTs7Pg=="
    )


@csrf_exempt
@_bank
def lista(request: HttpRequest, *_a) -> HttpResponse:
    target = request.POST.get("__EVENTTARGET", "") if request.method == "POST" else ""
    view = "szczegoly" if target == "szczegoly" else "lista"
    return _page(
        "legacy/lista.html",
        sid=session_of(request).id,
        viewstate="dDwtMTI4NzY1NDMyMTs7Pg==",
        view=view,
        operations=OPERATIONS,
    )


@_bank
def szczegoly(request: HttpRequest, *_a) -> HttpResponse:
    body = render_to_string(
        "legacy/szczegoly.html",
        {
            "charset": "windows-1250",
            "account": "PL 61 1090 1014 0000 0712 1981 2874",
            "count": len(OPERATIONS),
        },
    )
    return HttpResponse(body.encode("cp1250"), content_type="text/html; charset=windows-1250")


@_bank
def archiwum(request: HttpRequest, *_a) -> HttpResponse:
    return _page("legacy/notfound.html", status=404)


@_bank
def raport(request: HttpRequest, *_a) -> HttpResponse:
    return _page("legacy/error.html", status=500)


def print_gif(request: HttpRequest) -> HttpResponse:
    return HttpResponse(GIF, content_type="image/gif")


@csrf_exempt
@_insurer
def szkoda_stara(request: HttpRequest, *_a) -> HttpResponse:
    if request.method == "POST":
        polisa = request.POST.get("polisa", "").strip()
        data = request.POST.get("data", "").strip()
        opis = request.POST.get("opis", "").strip()
        if not (polisa and data and opis):
            return _page(
                "legacy/claim.html",
                error="Wypełnij wszystkie pola.",
                polisa=polisa,
                data=data,
                opis=opis,
            )
        return HttpResponseRedirect("/legacy/insurer/szkoda-stara.do?ok=1")
    return _page("legacy/claim.html", ok=request.GET.get("ok") == "1")


# LO-52: the statement's parameters depend on each other. `typ` M (monthly) wants `okres` as
# RRRR-MM, R (yearly) as RRRR; `tryb=druk` turns the preview into a print layout; `konto` is carried
# from link to link. A wrong combination shows the legacy error text, not a 400.
OKRES = {"M": r"^\d{4}-(0[1-9]|1[0-2])$", "R": r"^\d{4}$"}


@_bank
def wyciag(request: HttpRequest, *_a) -> HttpResponse:
    q = request.GET
    konto, typ, okres = q.get("konto", ""), q.get("typ", ""), q.get("okres", "")
    tryb = q.get("tryb", "podglad")
    sid = session_of(request).id
    error = None
    if not konto:
        error = "Brak numeru rachunku (konto)."
    elif typ not in OKRES:
        error = "Nieznany typ wyciągu: wybierz M (miesięczny) lub R (roczny)."
    elif not re.match(OKRES[typ], okres):
        error = (
            "Nieprawidłowy okres dla wyciągu miesięcznego (RRRR-MM)."
            if typ == "M"
            else "Nieprawidłowy okres dla wyciągu rocznego (RRRR)."
        )
    template = (
        "legacy/wyciag_druk.html" if tryb == "druk" and error is None else "legacy/wyciag.html"
    )
    return _page(
        template,
        sid=sid,
        konto=konto,
        typ=typ,
        okres=okres,
        error=error,
        operations=OPERATIONS if typ == "M" else OPERATIONS[:2],
    )


# LO-53: a legacy wrapper whose same-origin frame loads its own front end and mounts it late, after
# the page looks settled (no request in flight, DOM quiet). Only a mount wait that probes frames
# reads the rates; probing the top document finds no loader there and does not wait.
@_bank
def kursy(request: HttpRequest, *_a) -> HttpResponse:
    return _page("legacy/kursy.html", sid=session_of(request).id)


@_bank
def kursy_app(request: HttpRequest, *_a) -> HttpResponse:
    return _page("legacy/kursy_app.html", delay_ms=1500)


def _do(name: str, view: View, brand: str = "bank"):
    return re_path(rf"^legacy/{brand}/{name}\.do{JSID}$", view)


urlpatterns = [
    _do("historia", historia),
    _do("menu", menu),
    _do("lista", lista),
    _do("szczegoly", szczegoly),
    _do("archiwum", archiwum),
    _do("raport", raport),
    _do("wyciag", wyciag),
    _do("kursy", kursy),
    _do("kursy-app", kursy_app),
    _do("szkoda-stara", szkoda_stara, "insurer"),
    re_path(r"^legacy/static/print\.gif$", print_gif),
]
