import struct
import zlib

from conftest import login

from proving_ground import config
from proving_ground.captcha import widget_markup


def _widget(client, path, **kw):
    return client.get(path, SERVER_PORT=str(config.CONFIG.widget_port), **kw)


def _decode_png(data: bytes) -> tuple[int, int, bytes]:
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos, idat, w, h = 8, b"", 0, 0
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        kind, body = data[pos + 4 : pos + 8], data[pos + 8 : pos + 8 + length]
        if kind == b"IHDR":
            w, h = struct.unpack(">II", body[:8])
        if kind == b"IDAT":
            idat += body
        pos += 12 + length
    return w, h, zlib.decompress(idat)


def _red_tiles(png: bytes) -> set[int]:
    w, _, raw = _decode_png(png)
    stride = 1 + w * 3
    red = set()
    for i in range(9):
        x, y = (i % 3) * 100 + 50, (i // 3) * 100 + 50
        r, g, _b = raw[y * stride + 1 + x * 3 : y * stride + 1 + x * 3 + 3]
        if r > 200 and g < 60:
            red.add(i)
    return red


def test_markup_carries_vendor_markers():
    html = widget_markup("http://127.0.0.1:4101")
    assert 'class="g-recaptcha"' in html and "recaptcha/api2/anchor" in html


def test_answer_is_not_in_the_dom(client):
    page = _widget(client, "/widget/recaptcha/api2/bframe").content.decode()
    assert "czerwonym kołem" in page
    assert "true" not in page.lower().replace("credentials:'include'", "")


def test_wrong_answer_gives_no_token_and_right_answer_logs_in(client):
    login(client, "bank", "jan.testowy", password="wrong-not-real")
    _widget(client, "/widget/recaptcha/api2/bframe")
    bad = client.post(
        "/widget/recaptcha/api2/userverify", {"sel": ""}, SERVER_PORT=str(config.CONFIG.widget_port)
    )
    assert bad.json() == {"token": None}
    _widget(client, "/widget/recaptcha/api2/bframe")
    tiles = _red_tiles(_widget(client, "/widget/recaptcha/api2/payload").content)
    assert 2 <= len(tiles) <= 4
    token = client.post(
        "/widget/recaptcha/api2/userverify",
        {"sel": ",".join(map(str, sorted(tiles)))},
        SERVER_PORT=str(config.CONFIG.widget_port),
    ).json()["token"]
    assert token
    assert login(client, "bank", "jan.testowy", captcha_token=token)["Location"] == "/x"
    # a success clears the requirement; after a new failure the old token is spent
    login(client, "bank", "jan.testowy", password="wrong-not-real")
    assert "blad=captcha" in login(client, "bank", "jan.testowy", captcha_token=token)["Location"]
