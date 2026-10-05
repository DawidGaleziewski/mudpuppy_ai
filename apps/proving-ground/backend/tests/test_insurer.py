import json

from conftest import login
from django.core.files.uploadedfile import SimpleUploadedFile

from proving_ground import config
from proving_ground.store import STORE


def _in(client):
    login(client, "insurer", "ewa.polisowa")
    return client


def _post(client, path, body=None):
    return client.post(path, json.dumps(body or {}), content_type="application/json")


STEP1 = {"policy_nr": "7", "data_zdarzenia": "2026-03-10", "opis": "Stłuczka na parkingu"}


def test_401_without_login(client):
    for url in ("/api/insurer/policies", "/api/insurer/policies/7", "/api/insurer/claims/wizard"):
        assert client.get(url).status_code == 401
    assert _post(client, "/api/insurer/claims/wizard/step1", STEP1).status_code == 401


def test_other_brand_gets_401(client):
    login(client, "bank", "jan.testowy")
    assert client.get("/api/insurer/policies").status_code == 401


def test_policies_and_detail(client):
    _in(client)
    rows = client.get("/api/insurer/policies").json()["policies"]
    assert [(p["nr"], p["suma"]) for p in rows] == [("7", 80000), ("12", 40000), ("21", 20000)]
    assert client.get("/api/insurer/policies/12").json()["nazwa"] == "Mieszkanie nr 12"
    assert client.get("/api/insurer/policies/99").status_code == 404


def test_pdf_is_an_attachment(client):
    _in(client)
    r = client.get("/api/insurer/policies/7.pdf")
    assert r["Content-Type"] == "application/pdf"
    assert "attachment" in r["Content-Disposition"]
    assert r.content.startswith(b"%PDF-") and r.content.rstrip().endswith(b"%%EOF")


def test_assistance_threshold(client):
    _in(client)
    big = {a["id"]: a for a in client.get("/api/insurer/policies/7/addons").json()["addons"]}
    assert big["assistance-premium"]["dostepny"] is True
    small = {a["id"]: a for a in client.get("/api/insurer/policies/12/addons").json()["addons"]}
    ap = small["assistance-premium"]
    assert ap["dostepny"] is False
    assert ap["powod"] == "Dostępne dla polis z sumą ubezpieczenia od 50 000 zł"
    assert small["szyby"]["dostepny"] and small["opony"]["dostepny"]
    r = _post(
        client,
        "/api/insurer/policies/12/addons",
        {"addon_id": "assistance-premium", "data_rozpoczecia": "2026-04-01"},
    )
    assert r.status_code == 400 and r.json()["error"] == "addon_unavailable"
    ok = _post(
        client,
        "/api/insurer/policies/7/addons",
        {"addon_id": "assistance-premium", "data_rozpoczecia": "2026-04-01"},
    )
    assert ok.status_code == 200


def test_addon_start_date_rule(client):
    _in(client)
    url = "/api/insurer/policies/7/addons"

    def go(d):
        return _post(client, url, {"addon_id": "szyby", "data_rozpoczecia": d})

    assert go("2026-03-15").json()["error"] == "date_past"
    assert go("2026-03-16").status_code == 200
    assert go("2026-08-31").status_code == 200
    assert go("2026-09-01").json()["error"] == "date_after_end"
    assert go("16.03.2026").json()["error"] == "bad_date"


def test_claim_date_rule_is_server_side(client):
    _in(client)
    url = "/api/insurer/claims/wizard/step1"
    old = _post(client, url, {**STEP1, "data_zdarzenia": "2026-02-13"})
    assert old.status_code == 400
    assert old.json()["message"] == "Szkodę można zgłosić do 30 dni od zdarzenia."
    future = _post(client, url, {**STEP1, "data_zdarzenia": "2026-03-17"})
    assert future.json()["message"] == "Szkodę można zgłosić do 30 dni od zdarzenia."
    assert _post(client, url, {**STEP1, "data_zdarzenia": "2026-02-14"}).status_code == 200


def test_wizard_order_and_full_flow(client):
    _in(client)
    base = "/api/insurer/claims/wizard"
    assert client.get(base).json() == {"step": 1, "data": {}}
    r = _post(client, base + "/step2", {"miejsce": "Warszawa"})
    assert r.status_code == 409 and r.json() == {"error": "wizard_order", "step": 1}
    assert _post(client, base + "/step1", STEP1).json()["step"] == 2
    assert client.get(base).json()["data"]["opis"] == "Stłuczka na parkingu"
    r = _post(client, base + "/step1", STEP1)
    assert r.status_code == 409 and r.json()["step"] == 2
    assert _post(client, base + "/step3").status_code == 409
    assert _post(client, base + "/step2", {"miejsce": "Warszawa"}).json()["step"] == 3
    done = _post(client, base + "/step3").json()
    assert done["claim_nr"].startswith("SZ/2026/")
    assert len(STORE.data["claims_filed"]) == 1
    assert client.get(base).json() == {"step": 1, "data": {}}


def test_wizard_reset(client):
    _in(client)
    base = "/api/insurer/claims/wizard"
    _post(client, base + "/step1", STEP1)
    assert client.get(base).json()["step"] == 2
    assert _post(client, base + "/reset").json()["step"] == 1
    assert client.get(base).json() == {"step": 1, "data": {}}


def test_upload_widget_only_on_widget_port(client):
    _in(client)
    assert client.get("/widget/upload").status_code == 404
    port = str(config.CONFIG.widget_port)
    page = client.get("/widget/upload", SERVER_PORT=port)
    assert page.status_code == 200 and "Wyślij plik" in page.content.decode()
    f = SimpleUploadedFile("zdjecie.jpg", b"123456")
    r = client.post("/widget/upload", {"plik": f}, SERVER_PORT=port)
    assert "pg-upload" in r.content.decode()
    uploads = next(iter(STORE.data["sessions"].values())).extra["uploads"]
    file_id = next(k for k, v in uploads.items() if v["nazwa"] == "zdjecie.jpg")
    assert uploads[file_id]["rozmiar"] == 6
    base = "/api/insurer/claims/wizard"
    _post(client, base + "/step1", STEP1)
    r = _post(client, base + "/step2", {"miejsce": "Kraków", "uploaded_file_id": file_id})
    assert r.json()["data"]["plik"]["nazwa"] == "zdjecie.jpg"
