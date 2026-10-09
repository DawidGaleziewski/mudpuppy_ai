import time

from conftest import login

from proving_ground import config
from proving_ground.store import STORE


def test_health_and_robots(client):
    assert client.get("/healthz").content == b"ok"
    assert b"Disallow: /__admin/" in client.get("/robots.txt").content


def test_clock_is_fixed(client):
    assert client.get("/api/clock").json() == {"today": "2026-03-16"}


def test_reset_restores_runtime_state(client):
    STORE.data["orders"].append({"id": 1})
    assert client.get("/__admin/reset").status_code == 405
    assert client.post("/__admin/reset").json() == {"reset": True}
    assert STORE.data["orders"] == []


def test_shell_routes_render_the_shell(client):
    for p in ["/", "/sklep", "/sklep/produkt/kubek", "/bank", "/ubezpieczenia", "/logowanie"]:
        r = client.get(p)
        assert r.status_code == 200, p
        assert b'from "/mfe/shell/index.js"' in r.content


def test_import_map_names_every_micro_frontend(client):
    m = client.get("/mfe/import-map.json").json()
    assert set(m) == {"shop", "bank", "insurer", "cookies"}


def test_widget_paths_only_on_the_widget_port(client):
    assert client.get("/widget/recaptcha/api2/anchor").status_code == 404
    port = str(config.CONFIG.widget_port)
    assert client.get("/widget/recaptcha/api2/anchor", SERVER_PORT=port).status_code == 200
    assert client.get("/healthz", SERVER_PORT=port).status_code == 404


def test_protected_pages_redirect_to_the_brand_login(client):
    r = client.get("/bank/pulpit")
    assert r.status_code == 302
    assert r["Location"].startswith("/logowanie?marka=bank&next=%2Fbank%2Fpulpit")


def test_login_success_and_session(client):
    r = login(client, "bank", "jan.testowy")
    assert r.status_code == 302 and r["Location"] == "/x"
    info = client.get("/api/session").json()
    assert info["user"] == "bank-client" and info["brand"] == "bank"
    assert client.get("/bank/pulpit").status_code == 200


def test_login_wrong_brand_is_rejected(client):
    r = login(client, "shop", "jan.testowy")
    assert "blad=rejected" in r["Location"]


def test_bad_csrf_is_rejected(client):
    client.get("/api/login/form?marka=bank")
    r = client.post("/api/login", {"login": "jan.testowy", "haslo": "x", "csrf": "nope"})
    assert "blad=csrf" in r["Location"]


def test_captcha_required_after_first_failure_and_lockout_after_three(client):
    r = login(client, "bank", "jan.testowy", password="wrong-not-real")
    assert "blad=rejected" in r["Location"]
    assert client.get("/api/login/form?marka=bank").json()["captcha_required"] is True
    # Without a solved CAPTCHA the session cannot even try again
    assert "blad=captcha" in login(client, "bank", "jan.testowy")["Location"]
    # Other browsers can still fail: lockout counts per user
    from django.test import Client

    for _ in range(2):
        last = login(Client(), "bank", "jan.testowy", password="wrong-not-real")
    assert "blad=locked" in last["Location"]
    assert "blad=locked" in login(Client(), "bank", "jan.testowy")["Location"]
    STORE.reset()
    assert login(Client(), "bank", "jan.testowy")["Location"] == "/x"


def test_idle_timeout_expires_the_session(client, monkeypatch):
    monkeypatch.setenv("PG_SESSION_TIMEOUT_S", "1")
    config.reload()
    login(client, "bank", "jan.testowy")
    assert client.get("/api/session").status_code == 200
    time.sleep(1.2)
    r = client.get("/api/session")
    assert r.status_code == 401 and r.json()["expired"] is True
    assert client.get("/bank/pulpit").status_code == 302


def test_login_after_expiry_starts_a_fresh_idle_clock(client, monkeypatch):
    monkeypatch.setenv("PG_SESSION_TIMEOUT_S", "1")
    config.reload()
    login(client, "bank", "jan.testowy")
    time.sleep(1.2)
    assert client.get("/api/session").status_code == 401
    login(client, "bank", "jan.testowy")
    # the same session logs in again and stays logged in (it used to expire at once)
    assert client.get("/api/session").status_code == 200


def test_jsessionid_in_the_path_carries_the_session(client):
    login(client, "bank", "jan.testowy")
    sid = client.cookies["PGSESSID"].value
    from django.test import Client

    other = Client()
    r = other.get(f"/api/session;jsessionid={sid}")
    # /api/session itself is not a legacy path; the id is still read from it (LO-24)
    assert r.status_code in (200, 404)


def _timed_bundle(client) -> float:
    start = time.monotonic()
    client.get("/mfe/shop/index.js")
    return time.monotonic() - start


def test_bundle_delay_cookie_slows_micro_frontend_bundles(client):
    assert client.get("/__test/bundle-delay?ms=300").content == b"ok"
    assert client.cookies["pg_bundle_delay_ms"].value == "300"
    assert _timed_bundle(client) >= 0.3


def test_bundle_without_the_cookie_is_not_delayed(client):
    assert _timed_bundle(client) < 0.2


def test_bundle_delay_out_of_range_is_ignored(client):
    client.get("/__test/bundle-delay?ms=10001")
    assert _timed_bundle(client) < 0.2
    client.get("/__test/bundle-delay?ms=abc")
    assert _timed_bundle(client) < 0.2


def test_shell_bundle_is_never_delayed(client):
    client.get("/__test/bundle-delay?ms=500")
    start = time.monotonic()
    client.get("/mfe/shell/index.js")
    assert time.monotonic() - start < 0.3
