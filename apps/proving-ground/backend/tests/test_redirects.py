from django.test import Client


def test_category_chain(client) -> None:
    r1 = client.get("/shop/index.php?cat=7")
    assert r1.status_code == 301 and r1["Location"] == "/old/kategoria/7"
    r2 = client.get(r1["Location"])
    assert r2.status_code == 302 and r2["Location"] == "/sklep?kategoria=7"


def test_policy_meta_refresh_then_js(client) -> None:
    r1 = client.get("/polisa.php?id=P-100")
    html = r1.content.decode()
    assert r1.status_code == 200 and "Proszę czekać…" in html
    assert '<meta http-equiv="refresh" content="1;url=/stare/polisa/P-100">' in html
    r2 = client.get("/stare/polisa/P-100")
    assert r2.status_code == 200
    assert "location.replace('/ubezpieczenia#/polisy/P-100')" in r2.content.decode()


def test_rate_limit_429_after_30(client) -> None:
    codes = [client.get("/robots.txt").status_code for _ in range(31)]
    assert codes[:30] == [200] * 30
    assert codes[30] == 429
    r = client.get("/robots.txt")
    assert r["Retry-After"] == "1"
    assert r.content.decode("utf-8") == "Zbyt wiele żądań"


def test_rate_limit_is_per_session(client) -> None:
    for _ in range(31):
        client.get("/robots.txt")
    assert Client().get("/robots.txt").status_code == 200


def test_rate_limit_exemptions(client) -> None:
    for _ in range(40):
        assert client.get("/healthz").status_code == 200
    for _ in range(40):
        assert client.post("/__admin/reset").status_code != 429
