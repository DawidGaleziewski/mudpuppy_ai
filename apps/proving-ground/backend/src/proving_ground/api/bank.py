"""Bank API (spec 009, T010): accounts, transfers, statements, PDF, SSE ticker, rates image."""

import hashlib
import re
import time
from datetime import date, timedelta

from django.http import (
    HttpRequest,
    HttpResponse,
    JsonResponse,
    StreamingHttpResponse,
)
from django.urls import path
from django.views.decorators.csrf import csrf_exempt

from proving_ground.auth import require_api, session_of
from proving_ground.captcha import _png
from proving_ground.estate import TODAY
from proving_ground.store import STORE

DAILY_LIMIT = 2_000_000  # grosze
MAX_AMOUNT = 2_000_000
CUTOFF = "22:00"
TICKER_EVENTS = 600
TICKER_INTERVAL_S = 2

ERR_IBAN = "Nieprawidłowy numer rachunku."
ERR_AMOUNT = "Kwota musi mieścić się w przedziale 0,01–20 000,00 zł."  # noqa: RUF001
ERR_TITLE = "Tytuł przelewu musi mieć od 1 do 140 znaków."
ERR_ACCOUNT = "Nieprawidłowy rachunek źródłowy."
ERR_LIMIT = "Przekroczono dzienny limit przelewów 20 000,00 zł."


def iban_valid(value: str) -> bool:
    iban = value.replace(" ", "")
    if not re.fullmatch(r"PL\d{26}", iban):
        return False
    return int(iban[4:] + "2521" + iban[2:4]) % 97 == 1


def parse_amount(value: object) -> int | None:
    """'1 234,50' → 123450 grosze; only a decimal comma is accepted."""
    if not isinstance(value, str):
        return None
    text = value.strip().replace(" ", "").replace(" ", "")  # noqa: RUF001
    m = re.fullmatch(r"(\d+)(?:,(\d{1,2}))?", text)
    if not m:
        return None
    return int(m.group(1)) * 100 + int((m.group(2) or "0").ljust(2, "0"))


def format_amount(grosze: int) -> str:
    whole, frac = divmod(abs(grosze), 100)
    sign = "-" if grosze < 0 else ""
    return f"{sign}{whole:,}".replace(",", " ") + f",{frac:02d} zł"


def booking_date(clock_time: str) -> str:
    day = date.fromisoformat(TODAY)
    if clock_time >= CUTOFF:
        day += timedelta(days=1)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day.isoformat()


def _clock_time(request: HttpRequest) -> str:
    value = request.headers.get("X-PG-Clock-Time", "12:00")
    return value if re.fullmatch(r"\d{2}:\d{2}", value) else "12:00"


def _accounts(user: str) -> list[dict]:
    return [a for a in STORE.data["bank"]["accounts"] if a["user"] == user]


def _account_json(a: dict) -> dict:
    return {
        "id": a["id"],
        "name": a["name"],
        "iban": a["iban"],
        "balance": a["balance"],
        "balance_text": format_amount(a["balance"]),
    }


@require_api("bank")
def accounts(request: HttpRequest) -> JsonResponse:
    user = session_of(request).user
    with STORE.lock:
        return JsonResponse({"accounts": [_account_json(a) for a in _accounts(user)]})


@csrf_exempt
@require_api("bank")
def transfers(request: HttpRequest) -> JsonResponse:
    user = session_of(request).user
    if request.method == "GET":
        with STORE.lock:
            mine = [t for t in STORE.data["transfers"] if t["user"] == user]
        return JsonResponse({"transfers": mine})
    if request.method != "POST":
        return JsonResponse({"error": "method"}, status=405)
    import json

    try:
        body = json.loads(request.body or b"{}")
    except ValueError:
        body = {}
    if not isinstance(body, dict):
        body = {}

    def bad(message: str, field: str) -> JsonResponse:
        return JsonResponse({"error": message, "field": field}, status=400)

    with STORE.lock:
        source = next((a for a in _accounts(user) if a["id"] == body.get("from_account")), None)
        if source is None:
            return bad(ERR_ACCOUNT, "from_account")
        to_iban = str(body.get("to_iban", "")).replace(" ", "")
        if not iban_valid(to_iban):
            return bad(ERR_IBAN, "to_iban")
        amount = parse_amount(body.get("amount"))
        if amount is None or not 1 <= amount <= MAX_AMOUNT:
            return bad(ERR_AMOUNT, "amount")
        title = body.get("title")
        if not isinstance(title, str) or not 1 <= len(title.strip()) <= 140:
            return bad(ERR_TITLE, "title")
        spent = sum(
            t["amount"]
            for t in STORE.data["transfers"]
            if t["user"] == user and t["created"] == TODAY
        )
        if spent + amount > DAILY_LIMIT:
            return bad(ERR_LIMIT, "amount")
        if amount > source["balance"]:
            return bad("Niewystarczające środki na rachunku.", "amount")
        source["balance"] -= amount
        transfer = {
            "id": f"tr-{len(STORE.data['transfers']) + 1}",
            "user": user,
            "from_account": source["id"],
            "to_iban": to_iban,
            "amount": amount,
            "amount_text": format_amount(amount),
            "title": title.strip(),
            "created": TODAY,
            "booking_date": booking_date(_clock_time(request)),
        }
        STORE.data["transfers"].append(transfer)
    return JsonResponse(transfer, status=201)


_MONTH = re.compile(r"(\d{4})-(0[1-9]|1[0-2])")
_PAYEES = ["Biedronka", "Orlen", "Netflix", "Czynsz", "MarketSite", "Tauron", "Play", "Żabka"]


def _operations(month: str) -> list[dict]:
    if month > TODAY[:7]:
        return []
    digest = hashlib.sha256(month.encode()).digest()
    ops = []
    for i in range(8):
        day = 1 + digest[i] % 28
        grosze = -(500 + (digest[i + 8] * 97 + i * 1313) % 30000)
        ops.append(
            {
                "date": f"{month}-{day:02d}",
                "title": _PAYEES[digest[i + 16] % len(_PAYEES)],
                "amount": grosze,
                "amount_text": format_amount(grosze),
            }
        )
    return sorted(ops, key=lambda o: o["date"])


@require_api("bank")
def statements(request: HttpRequest) -> JsonResponse:
    month = request.GET.get("miesiac", TODAY[:7])
    if not _MONTH.fullmatch(month):
        return JsonResponse({"error": "Nieprawidłowy miesiąc."}, status=400)
    return JsonResponse({"month": month, "operations": _operations(month)})


def _pdf(text: str) -> bytes:
    stream = f"BT /F1 18 Tf 50 750 Td ({text}) Tj ET".encode()
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for n, obj in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % n + obj + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return bytes(out)


@require_api("bank")
def statement_pdf(request: HttpRequest, month: str) -> HttpResponse:
    if not _MONTH.fullmatch(month):
        return JsonResponse({"error": "Nieprawidłowy miesiąc."}, status=400)
    response = HttpResponse(_pdf(f"Wyciag {month}"), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="wyciag-{month}.pdf"'
    return response


def ticker_rate(i: int) -> str:
    return f"{4.2000 + ((i * 37) % 21 - 10) / 1000:.4f}".replace(".", ",")


def ticker(request: HttpRequest) -> StreamingHttpResponse:
    def events():
        for i in range(TICKER_EVENTS):
            data = f'{{"pair": "EUR/PLN", "rate": "{ticker_rate(i)}"}}'
            yield f"id: {i}\nevent: rate\ndata: {data}\n\n"
            time.sleep(TICKER_INTERVAL_S)

    response = StreamingHttpResponse(events(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


# 3x5 digit glyphs for the baked-in rates banner (LO-16): the text exists only in the pixels.
_GLYPHS = {
    "0": "111101101101111",
    "1": "010110010010111",
    "2": "111001111100111",
    "3": "111001111001111",
    "4": "101101111001001",
    "5": "111100111001111",
    "6": "111100111101111",
    "7": "111001001001001",
    "8": "111101111101111",
    "9": "111101111001111",
    ",": "000000000010100",
}
_ROWS = [
    ("EUR", (30, 90, 200), "4,2150", "4,2480"),
    ("USD", (200, 40, 40), "3,8920", "3,9310"),
    ("CHF", (30, 150, 80), "4,5310", "4,5790"),
]
_SCALE = 5


def rates_png(request: HttpRequest) -> HttpResponse:
    width, height = 420, 130
    pixels: dict[tuple[int, int], tuple[int, int, int]] = {}

    def draw_text(text: str, x0: int, y0: int, color: tuple[int, int, int]) -> None:
        for n, ch in enumerate(text):
            glyph = _GLYPHS[ch]
            for k, bit in enumerate(glyph):
                if bit == "1":
                    gx, gy = x0 + n * 4 * _SCALE + (k % 3) * _SCALE, y0 + (k // 3) * _SCALE
                    for dx in range(_SCALE):
                        for dy in range(_SCALE):
                            pixels[(gx + dx, gy + dy)] = color

    for r, (_, color, buy, sell) in enumerate(_ROWS):
        y = 12 + r * 38
        for dx in range(24):
            for dy in range(25):
                pixels[(12 + dx, y + dy)] = color
        draw_text(buy, 60, y, (20, 20, 20))
        draw_text(sell, 230, y, (20, 20, 20))

    png = _png(width, height, lambda x, y: pixels.get((x, y), (245, 240, 220)))
    response = HttpResponse(png, content_type="image/png")
    response["Cache-Control"] = "no-store"
    return response


urlpatterns = [
    path("api/bank/accounts", accounts),
    path("api/bank/transfers", transfers),
    path("api/bank/statements", statements),
    path("api/bank/statements/<str:month>.pdf", statement_pdf),
    path("api/bank/ticker", ticker),
    path("api/bank/rates.png", rates_png),
]
