import json

from conftest import login

from proving_ground.store import STORE


def gql(client, op, **variables):
    r = client.post(
        "/api/shop/graphql",
        json.dumps({"operationName": op, "variables": variables}),
        content_type="application/json",
    )
    assert r.status_code == 200
    return r.json()


def solved_token(client):
    sid = client.cookies["PGSESSID"].value
    tok = "test-token-not-real"
    STORE.data["sessions"][sid].extra.setdefault("captcha_tokens", set()).add(tok)
    return tok


ORDER = {
    "name": "Jan Test",
    "email": "jan@example.test",
    "postal_code": "00-001",
    "city": "Warszawa",
    "delivery": "kurier",
    "payment": "blik",
}


def test_catalog_paging_and_filters(client):
    d = gql(client, "Catalog")["data"]["catalog"]
    assert len(d["products"]) == 12 and d["hasNext"]
    assert len(STORE.data["shop"]["products"]) >= 30
    past = gql(client, "Catalog", strona=99)["data"]["catalog"]
    assert past["products"] == [] and past["hasNext"] is True
    cheap = gql(client, "Catalog", cena_do=40, sort="cena_malejaco")["data"]["catalog"]["products"]
    assert cheap and all(p["price"] <= 4000 for p in cheap)
    assert cheap == sorted(cheap, key=lambda p: -p["price"])
    cat = gql(client, "Catalog", kategoria=3)["data"]["catalog"]["products"]
    assert cat and all(p["category"] == 3 for p in cat)


def test_cart_rules_and_free_delivery(client):
    assert gql(client, "Cart")["data"]["cart"]["count"] == 0
    cart = gql(client, "AddToCart", slug="plaszcz-mzawka", qty=1)["data"]["cart"]
    assert cart["total"] == 28900 and cart["free_delivery"] and cart["count"] == 1
    cart = gql(client, "UpdateCart", slug="plaszcz-mzawka", qty=0)["data"]["cart"]
    assert cart["items"] == []
    cart = gql(client, "AddToCart", slug="klapki-sitowie", qty=2)["data"]["cart"]
    assert not cart["free_delivery"] and cart["delivery_cost"] == 1499
    bad = gql(client, "UpdateCart", slug="klapki-sitowie", qty=11)
    assert bad["errors"][0]["extensions"]["field"] == "qty"
    assert gql(client, "AddToCart", slug="nie-ma", qty=1)["errors"]


def test_carts_are_per_session(client):
    from django.test import Client

    gql(client, "AddToCart", slug="klapki-sitowie", qty=1)
    assert gql(Client(), "Cart")["data"]["cart"]["count"] == 0


def test_place_order_validation_and_success(client):
    gql(client, "AddToCart", slug="klapki-sitowie", qty=1)
    r = gql(client, "PlaceOrder", **{**ORDER, "postal_code": "123", "email": ""})
    assert {e["extensions"]["field"] for e in r["errors"]} == {"postal_code", "email"}
    r = gql(client, "PlaceOrder", **{**ORDER, "delivery": "paczkomat"})
    assert r["errors"][0]["extensions"]["field"] == "locker"
    r = gql(client, "PlaceOrder", **ORDER, captcha_token="nope")
    assert r["errors"][0]["extensions"]["code"] == "CAPTCHA"
    r = gql(client, "PlaceOrder", **ORDER, captcha_token=solved_token(client))
    assert r["errors"] == [] and STORE.data["orders"][0]["grand_total"] == 3900 + 1499
    assert gql(client, "Cart")["data"]["cart"]["count"] == 0


def test_lockers(client):
    d = client.get("/api/shop/lockers?miasto=Kraków").json()
    assert len(d["lockers"]) >= 1 and len(d["cities"]) == 5
    assert client.get("/api/shop/lockers?miasto=Nigdzie").json()["lockers"] == []


def test_orders_need_login(client):
    assert client.get("/api/shop/orders").status_code == 401
    login(client, "shop", "klient.sklep")
    gql(client, "AddToCart", slug="klapki-sitowie", qty=1)
    gql(client, "PlaceOrder", **ORDER, captcha_token=solved_token(client))
    orders = client.get("/api/shop/orders").json()["orders"]
    assert len(orders) == 1 and orders[0]["id"] == "ZAM-00001"
