import json

from conftest import login

from proving_ground.api import bank


def bank_client(client):
    login(client, "bank", "jan.testowy")
    return client


def post(client, body, **extra):
    return client.post(
        "/api/bank/transfers", json.dumps(body), content_type="application/json", **extra
    )


GOOD = "PL93109010140000000999999001"


def transfer(**over):
    body = {"from_account": "acc-1", "to_iban": GOOD, "amount": "10,00", "title": "Czynsz"}
    body.update(over)
    return body


def test_seed_ibans_valid():
    from proving_ground.store import STORE

    assert all(bank.iban_valid(a["iban"]) for a in STORE.data["bank"]["accounts"])


def test_requires_login(client):
    for url in ["/api/bank/accounts", "/api/bank/statements", "/api/bank/statements/2026-01.pdf"]:
        assert client.get(url).status_code == 401
    assert post(client, transfer()).status_code == 401


def test_accounts(client):
    data = bank_client(client).get("/api/bank/accounts").json()["accounts"]
    assert [a["name"] for a in data] == ["Konto Osobiste", "Konto Oszczędnościowe"]


def test_iban_checksum(client):
    bank_client(client)
    r = post(client, transfer(to_iban="PL93109010140000000999999002"))
    assert r.status_code == 400 and r.json()["error"] == "Nieprawidłowy numer rachunku."
    assert post(client, transfer(to_iban="PL12")).status_code == 400
    assert post(client, transfer()).status_code == 201


def test_amount_parsing_and_range(client):
    bank_client(client)
    msg = "Kwota musi mieścić się w przedziale 0,01–20 000,00 zł."  # noqa: RUF001
    for bad in ["0", "0,00", "20 000,01", "10.50", "abc", ""]:
        r = post(client, transfer(amount=bad))
        assert r.status_code == 400 and r.json()["error"] == msg, bad
    assert post(client, transfer(amount="0,01")).status_code == 201
    assert post(client, transfer(amount="1 234,5")).json()["amount"] == 123450


def test_title_and_account(client):
    bank_client(client)
    assert post(client, transfer(title="")).status_code == 400
    assert post(client, transfer(title="x" * 141)).status_code == 400
    assert post(client, transfer(title="x" * 140)).status_code == 201
    assert post(client, transfer(from_account="nope")).status_code == 400


def test_balance_lowered(client):
    bank_client(client)
    post(client, transfer(amount="100,00"))
    accs = client.get("/api/bank/accounts").json()["accounts"]
    assert accs[0]["balance"] == 1254367 - 10000


def test_daily_limit(client):
    bank_client(client)
    assert post(client, transfer(from_account="acc-2", amount="15 000,00")).status_code == 201
    r = post(client, transfer(from_account="acc-2", amount="5 000,01"))
    assert r.status_code == 400 and "limit" in r.json()["error"]
    assert post(client, transfer(from_account="acc-2", amount="5 000,00")).status_code == 201


def test_booking_date(client):
    bank_client(client)
    assert post(client, transfer()).json()["booking_date"] == "2026-03-16"
    r = post(client, transfer(), HTTP_X_PG_CLOCK_TIME="22:00")
    assert r.json()["booking_date"] == "2026-03-17"


def test_booking_skips_weekend(monkeypatch):
    monkeypatch.setattr(bank, "TODAY", "2026-03-20")  # Friday
    assert bank.booking_date("23:30") == "2026-03-23"
    assert bank.booking_date("21:59") == "2026-03-20"


def test_statements(client):
    bank_client(client)
    a = client.get("/api/bank/statements?miesiac=2026-02").json()
    assert a["operations"] and a == client.get("/api/bank/statements?miesiac=2026-02").json()
    assert client.get("/api/bank/statements?miesiac=1999-01").json()["operations"]
    assert client.get("/api/bank/statements?miesiac=2026-04").json()["operations"] == []


def test_pdf(client):
    r = bank_client(client).get("/api/bank/statements/2026-02.pdf")
    assert r["Content-Type"] == "application/pdf"
    assert r["Content-Disposition"] == 'attachment; filename="wyciag-2026-02.pdf"'
    assert r.content.startswith(b"%PDF-") and r.content.rstrip().endswith(b"%%EOF")


def test_ticker_first_event(client, monkeypatch):
    monkeypatch.setattr(bank.time, "sleep", lambda _s: None)
    r = client.get("/api/bank/ticker")
    assert r["Content-Type"].startswith("text/event-stream")
    events = list(r.streaming_content)
    assert len(events) == 600 and b"EUR/PLN" in events[0]


def test_rates_png(client):
    r = client.get("/api/bank/rates.png")
    assert r["Content-Type"] == "image/png" and r.content.startswith(b"\x89PNG")
