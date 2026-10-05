from conftest import login


def _bank(client):
    login(client, "bank", "jan.testowy")
    return client.get("/api/session").json()["legacy_sid"]


def test_login_redirect(client) -> None:
    r = client.get("/legacy/bank/historia.do")
    assert r.status_code == 302
    assert r["Location"] == "/logowanie?marka=bank&next=/bank/historia"
    assert client.get("/legacy/insurer/szkoda-stara.do").status_code == 302


def test_frameset_with_jsessionid(client) -> None:
    sid = _bank(client)
    html = client.get(f"/legacy/bank/historia.do;jsessionid={sid}").content.decode()
    assert '<frameset cols="180,*"' in html
    assert f"menu.do;jsessionid={sid}" in html
    assert f"lista.do;jsessionid={sid}" in html


def test_jsessionid_alone_authenticates(client) -> None:
    from django.test import Client

    sid = _bank(client)
    other = Client()
    r = other.get(f"/legacy/bank/lista.do;jsessionid={sid}")
    assert r.status_code == 200


def test_menu_postback(client) -> None:
    _bank(client)
    html = client.get("/legacy/bank/menu.do").content.decode()
    assert "__doPostBack('lista','')" in html
    assert "javascript:void(0)" in html
    assert "__VIEWSTATE" in html and "__EVENTTARGET" in html
    assert "archiwum.do" in html and "raport.do" in html


def test_lista_markup_and_switch(client) -> None:
    _bank(client)
    html = client.get("/legacy/bank/lista.do").content.decode()
    assert html.count('id="row"') == 4
    assert "/legacy/static/print.gif" in html
    assert "<label" not in html and "aria-" not in html
    assert html.count("<form") == 2
    assert "Widok: lista" in html
    posted = client.post(
        "/legacy/bank/lista.do", {"__EVENTTARGET": "szczegoly", "__VIEWSTATE": "x"}
    ).content.decode()
    assert "Widok: szczegoly" in posted
    back = client.post("/legacy/bank/lista.do", {"__EVENTTARGET": "lista"}).content.decode()
    assert "Widok: lista" in back


def test_print_gif(client) -> None:
    r = client.get("/legacy/static/print.gif")
    assert r["Content-Type"] == "image/gif"
    assert r.content.startswith(b"GIF89a")


def test_szczegoly_cp1250(client) -> None:
    _bank(client)
    r = client.get("/legacy/bank/szczegoly.do")
    assert r["Content-Type"] == "text/html; charset=windows-1250"
    text = r.content.decode("cp1250")
    assert "Szczegóły operacji – zażółć gęślą jaźń" in text  # noqa: RUF001
    try:
        r.content.decode("utf-8")
        raise AssertionError("body must not be valid utf-8")
    except UnicodeDecodeError:
        pass


def test_dead_and_broken_pages(client) -> None:
    _bank(client)
    r = client.get("/legacy/bank/archiwum.do")
    assert r.status_code == 404 and "Strona nie istnieje" in r.content.decode()
    r = client.get("/legacy/bank/raport.do")
    assert r.status_code == 500 and "Wystąpił błąd aplikacji (kod 0x1F)" in r.content.decode()


def test_old_claim_form_post_redirect_get(client) -> None:
    login(client, "insurer", "ewa.polisowa")
    html = client.get("/legacy/insurer/szkoda-stara.do").content.decode()
    assert "Nr polisy" in html and "Data zdarzenia" in html and "Opis" in html
    assert "<label" not in html
    bad = client.post("/legacy/insurer/szkoda-stara.do", {"polisa": "P-1"})
    assert bad.status_code == 200
    r = client.post(
        "/legacy/insurer/szkoda-stara.do",
        {"polisa": "P-1", "data": "2026-03-10", "opis": "Stłuczka"},
    )
    assert r.status_code == 302
    assert r["Location"] == "/legacy/insurer/szkoda-stara.do?ok=1"
    assert "Zgłoszenie przyjęte" in client.get(r["Location"]).content.decode()
