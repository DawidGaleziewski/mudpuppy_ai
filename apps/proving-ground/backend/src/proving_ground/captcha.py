"""A local, offline CAPTCHA look-alike (LO-37, research §4).

It carries the DOM markers of the real vendor (``g-recaptcha`` container, an iframe under
``/widget/recaptcha/api2/anchor``) so Pathfinder's existing detection applies unchanged. Step 1 is
a checkbox; step 2 is a 3x3 image grid where the answer (tiles with a red circle) exists only in
the PNG's pixels, never in the DOM, so clicking alone cannot pass it. A solved challenge posts a
one-time token to the framing page, which sends it back as ``g-recaptcha-response``.

Pathfinder must never solve this widget: it hands the page to a human.
"""

import html
import random
import secrets
import struct
import zlib

from django.http import HttpRequest, HttpResponse
from django.views.decorators.csrf import csrf_exempt

from . import config
from .sessions import Session

SITE_KEY = "pg-test-key"
GRID = 3
TILE = 100


def widget_markup(widget_origin: str) -> str:
    """The snippet a framing page embeds (for server-rendered pages; React apps mirror it)."""
    src = f"{widget_origin}/widget/recaptcha/api2/anchor?k={SITE_KEY}"
    return (
        f'<div class="g-recaptcha" data-sitekey="{SITE_KEY}">'
        f'<iframe title="reCAPTCHA" src="{html.escape(src)}" width="304" height="78" '
        f'frameborder="0" scrolling="no"></iframe>'
        f'<input type="hidden" name="g-recaptcha-response" value=""></div>'
    )


def verify(session: Session, token: str) -> bool:
    tokens: set[str] = session.extra.setdefault("captcha_tokens", set())
    if token and token in tokens:
        tokens.discard(token)
        return True
    return False


def _page(body: str) -> HttpResponse:
    doc = (
        '<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>reCAPTCHA</title>'
        "<style>body{margin:0;font:13px Roboto,Arial,sans-serif;background:#f9f9f9}"
        ".rc-anchor{border:1px solid #d3d3d3;border-radius:3px;width:300px;height:74px;"
        "display:flex;align-items:center;gap:12px;padding:0 12px;box-sizing:border-box;"
        "background:#f9f9f9}"
        ".rc-box{width:24px;height:24px;border:2px solid #c1c1c1;border-radius:2px;"
        "background:#fff;cursor:pointer}"
        ".rc-grid{display:grid;grid-template-columns:repeat(3,100px);gap:2px;position:relative}"
        ".rc-tile{width:100px;height:100px;background-image:url(payload);cursor:pointer;border:0;padding:0}"
        ".rc-tile.sel{outline:4px solid #4a90e2;outline-offset:-4px}"
        ".rc-head{background:#4a90e2;color:#fff;padding:12px;width:280px}"
        "</style></head><body>" + body + "</body></html>"
    )
    response = HttpResponse(doc, content_type="text/html; charset=utf-8")
    response["Content-Security-Policy"] = f"frame-ancestors http://127.0.0.1:{config.CONFIG.port}"
    return response


def anchor(request: HttpRequest) -> HttpResponse:
    return _page(
        '<div class="rc-anchor" id="recaptcha-anchor">'
        '<div class="rc-box recaptcha-checkbox" onclick="location.href=\'bframe\'"></div>'
        "<span>Nie jestem robotem</span>"
        '<span style="margin-left:auto;font-size:10px;color:#555">reCAPTCHA<br>'
        "Prywatność - Warunki</span></div>"
    )


def _new_challenge(session: Session) -> list[bool]:
    rng = random.Random(secrets.randbits(64))
    answer = [False] * (GRID * GRID)
    for i in rng.sample(range(GRID * GRID), rng.randint(2, 4)):
        answer[i] = True
    session.extra["captcha_answer"] = answer
    return answer


def bframe(request: HttpRequest) -> HttpResponse:
    s: Session = request.pg_session  # type: ignore[attr-defined]
    _new_challenge(s)
    tiles = "".join(
        f'<button type="button" class="rc-tile" data-i="{i}" '
        f'style="background-position:-{(i % GRID) * TILE}px -{(i // GRID) * TILE}px"></button>'
        for i in range(GRID * GRID)
    )
    parent = f"http://127.0.0.1:{config.CONFIG.port}"
    script = (
        "<script>"
        "document.querySelectorAll('.rc-tile').forEach(t=>t.onclick=()=>t.classList.toggle('sel'));"
        "document.getElementById('rc-verify').onclick=async()=>{"
        "const sel=[...document.querySelectorAll('.rc-tile.sel')].map(t=>t.dataset.i).join(',');"
        "const r=await fetch('userverify',{method:'POST',body:new URLSearchParams({sel}),"
        "credentials:'include'});const j=await r.json();"
        "if(j.token){parent.postMessage({type:'pg-captcha',token:j.token},"
        f"{parent!r});document.body.innerHTML='<p>Zweryfikowano</p>';}}"
        "else{location.reload();}};"
        "</script>"
    )
    return _page(
        '<div class="rc-head">Zaznacz wszystkie obrazy z czerwonym kołem</div>'
        f'<div class="rc-grid">{tiles}</div>'
        '<button type="button" id="rc-verify">Zweryfikuj</button>' + script
    )


def _png(width: int, height: int, pixel) -> bytes:
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            raw.extend(pixel(x, y))

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 6))
        + chunk(b"IEND", b"")
    )


def payload(request: HttpRequest) -> HttpResponse:
    s: Session = request.pg_session  # type: ignore[attr-defined]
    answer: list[bool] = s.extra.get("captcha_answer") or _new_challenge(s)
    size = GRID * TILE

    def pixel(x: int, y: int) -> tuple[int, int, int]:
        i = (y // TILE) * GRID + (x // TILE)
        cx, cy = x % TILE - TILE // 2, y % TILE - TILE // 2
        if answer[i] and cx * cx + cy * cy < 30 * 30:
            return (220, 30, 30)
        if not answer[i] and abs(cx) < 25 and abs(cy) < 25:
            return (40, 90, 200)  # a blue square on the other tiles
        return (200 + (i * 7) % 40, 200, 190)

    return HttpResponse(_png(size, size, pixel), content_type="image/png")


@csrf_exempt
def userverify(request: HttpRequest) -> HttpResponse:
    from django.http import JsonResponse

    s: Session = request.pg_session  # type: ignore[attr-defined]
    answer: list[bool] | None = s.extra.pop("captcha_answer", None)
    chosen = {int(x) for x in request.POST.get("sel", "").split(",") if x.isdigit()}
    if answer is None or chosen != {i for i, v in enumerate(answer) if v}:
        return JsonResponse({"token": None})
    token = secrets.token_urlsafe(24)
    s.extra.setdefault("captcha_tokens", set()).add(token)
    return JsonResponse({"token": token})
