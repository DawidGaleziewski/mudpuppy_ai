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


def test_statement_parameters_depend_on_each_other(client) -> None:
    """LO-52 (spec 019): typ decides the format of okres, tryb=druk the layout, konto travels."""
    sid = _bank(client)
    menu = client.get("/legacy/bank/menu.do").content.decode()
    assert "wyciag.do;jsessionid=" in menu and 'target="_top"' in menu
    base = f"/legacy/bank/wyciag.do;jsessionid={sid}?konto=4521"
    monthly = client.get(f"{base}&typ=M&okres=2026-03&tryb=podglad").content.decode()
    assert "rachunek 4521, okres 2026-03" in monthly and "miesięczny" in monthly
    assert "konto=4521&amp;typ=M&amp;okres=2026-03&amp;tryb=druk" in monthly
    assert "typ=R&amp;okres=2026&amp;tryb=podglad" in monthly
    yearly_print = client.get(f"{base}&typ=R&okres=2026&tryb=druk").content.decode()
    assert "WYDRUK WYCIĄGU" in yearly_print and "Okres: 2026" in yearly_print
    wrong = client.get(f"{base}&typ=M&okres=2026&tryb=podglad").content.decode()
    assert "Nieprawidłowy okres dla wyciągu miesięcznego (RRRR-MM)." in wrong
    wrong_yearly = client.get(f"{base}&typ=R&okres=2026-03&tryb=druk").content.decode()
    assert "Nieprawidłowy okres dla wyciągu rocznego (RRRR)." in wrong_yearly
    assert "WYDRUK" not in wrong_yearly
    assert "Brak numeru rachunku" in client.get("/legacy/bank/wyciag.do").content.decode()


def test_rates_mount_late_inside_a_frame(client) -> None:
    """LO-53 (spec 019): the wrapper frames a front end that mounts after the page is quiet."""
    sid = _bank(client)
    assert "kursy.do;jsessionid=" in client.get("/legacy/bank/menu.do").content.decode()
    wrapper = client.get(f"/legacy/bank/kursy.do;jsessionid={sid}").content.decode()
    assert f'src="/legacy/bank/kursy-app.do;jsessionid={sid}"' in wrapper
    app = client.get(f"/legacy/bank/kursy-app.do;jsessionid={sid}").content.decode()
    assert '<script type="importmap">' in app and '<div id="app"></div>' in app
    assert "setTimeout" in app and "1500" in app
