"""Shop API: a GraphQL-like endpoint (LO-42), parcel lockers (LO-48), the account's orders.

Every GraphQL-like operation answers HTTP 200 with ``{"data", "errors"}``; failures live in
``errors`` (``extensions.code`` and ``extensions.field``). Prices are integers in grosze.
"""

import json
import re
from typing import Any

from django.http import HttpRequest, JsonResponse
from django.urls import path
from django.views.decorators.csrf import csrf_exempt

from .. import captcha
from ..auth import require_api, session_of
from ..estate import TODAY
from ..store import STORE

PAGE_SIZE = 12
FREE_DELIVERY_FROM = 20000
DELIVERY_COST = 1499
MAX_QTY = 10
POSTAL = re.compile(r"^\d{2}-\d{3}$")
SORTS = ("nazwa", "cena_rosnaco", "cena_malejaco")


class GqlError(Exception):
    def __init__(self, message: str, code: str = "BAD_USER_INPUT", field: str | None = None):
        super().__init__(message)
        self.message, self.code, self.field = message, code, field

    def payload(self) -> dict[str, Any]:
        ext: dict[str, Any] = {"code": self.code}
        if self.field:
            ext["field"] = self.field
        return {"message": self.message, "extensions": ext}


def _shop() -> dict[str, Any]:
    return STORE.data["shop"]


def _product(slug: str) -> dict[str, Any] | None:
    return next((p for p in _shop()["products"] if p["slug"] == slug), None)


def _public(p: dict[str, Any]) -> dict[str, Any]:
    return {k: p[k] for k in ("id", "slug", "name", "category", "price", "description", "hue")}


def _int(value: Any, field: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        raise GqlError("Nieprawidłowa liczba.", field=field) from None


def _category_id(value: Any) -> int | None:
    if value in (None, ""):
        return None
    for c in _shop()["categories"]:
        if str(value) in (str(c["id"]), c["slug"]):
            return c["id"]
    return -1


def _catalog(v: dict[str, Any]) -> dict[str, Any]:
    items = list(_shop()["products"])
    cat = _category_id(v.get("kategoria"))
    if cat is not None:
        items = [p for p in items if p["category"] == cat]
    if v.get("cena_od") not in (None, ""):
        items = [p for p in items if p["price"] >= _int(v["cena_od"], "cena_od") * 100]
    if v.get("cena_do") not in (None, ""):
        items = [p for p in items if p["price"] <= _int(v["cena_do"], "cena_do") * 100]
    sort = v.get("sort") or "nazwa"
    if sort == "cena_rosnaco":
        items.sort(key=lambda p: p["price"])
    elif sort == "cena_malejaco":
        items.sort(key=lambda p: -p["price"])
    else:
        items.sort(key=lambda p: p["name"])
    page = max(1, _int(v.get("strona") or 1, "strona"))
    chunk = items[(page - 1) * PAGE_SIZE : page * PAGE_SIZE]
    # LO-26: there is always a next page; past the end it is simply empty.
    return {
        "products": [_public(p) for p in chunk],
        "page": page,
        "pageSize": PAGE_SIZE,
        "hasNext": True,
        "categories": _shop()["categories"],
    }


def _cart_lines(request: HttpRequest) -> dict[str, int]:
    return STORE.data["carts"].setdefault(session_of(request).id, {})


def _cart_view(request: HttpRequest) -> dict[str, Any]:
    items, total, count = [], 0, 0
    for slug, qty in _cart_lines(request).items():
        p = _product(slug)
        if p is None:
            continue
        items.append(
            {
                "slug": slug,
                "name": p["name"],
                "price": p["price"],
                "qty": qty,
                "line_total": p["price"] * qty,
                "hue": p["hue"],
            }
        )
        total += p["price"] * qty
        count += qty
    free = total >= FREE_DELIVERY_FROM
    delivery = 0 if free or not items else DELIVERY_COST
    return {
        "items": items,
        "count": count,
        "total": total,
        "free_delivery": free,
        "delivery_cost": delivery,
        "grand_total": total + delivery,
    }


def _qty(value: Any) -> int:
    q = _int(value, "qty")
    if not 1 <= q <= MAX_QTY:
        raise GqlError(f"Ilość musi być od 1 do {MAX_QTY}.", field="qty")
    return q


def _add_to_cart(request: HttpRequest, v: dict[str, Any]) -> dict[str, Any]:
    slug = str(v.get("slug", ""))
    if _product(slug) is None:
        raise GqlError("Nie znaleziono produktu.", "NOT_FOUND", "slug")
    qty = _qty(v.get("qty", 1))
    lines = _cart_lines(request)
    if lines.get(slug, 0) + qty > MAX_QTY:
        raise GqlError(f"Ilość musi być od 1 do {MAX_QTY}.", field="qty")
    lines[slug] = lines.get(slug, 0) + qty
    return {"cart": _cart_view(request)}


def _update_cart(request: HttpRequest, v: dict[str, Any]) -> dict[str, Any]:
    slug = str(v.get("slug", ""))
    lines = _cart_lines(request)
    if slug not in lines:
        raise GqlError("Produktu nie ma w koszyku.", "NOT_FOUND", "slug")
    if _int(v.get("qty"), "qty") == 0:
        del lines[slug]  # quantity 0 removes the line
    else:
        lines[slug] = _qty(v.get("qty"))
    return {"cart": _cart_view(request)}


def _place_order(request: HttpRequest, v: dict[str, Any]) -> dict[str, Any]:
    s = session_of(request)
    lines = _cart_lines(request)
    cart = _cart_view(request)
    if not cart["items"]:
        raise GqlError("Koszyk jest pusty.", field="cart")
    errors: list[GqlError] = []
    if not str(v.get("name", "")).strip():
        errors.append(GqlError("Podaj imię i nazwisko.", field="name"))
    if not str(v.get("email", "")).strip():
        errors.append(GqlError("Podaj adres e-mail.", field="email"))
    if not POSTAL.match(str(v.get("postal_code", ""))):
        errors.append(GqlError("Kod pocztowy musi mieć format 00-000.", field="postal_code"))
    if not str(v.get("city", "")).strip():
        errors.append(GqlError("Wybierz miasto.", field="city"))
    delivery = v.get("delivery")
    if delivery not in ("kurier", "paczkomat"):
        errors.append(GqlError("Wybierz sposób dostawy.", field="delivery"))
    elif delivery == "paczkomat" and not str(v.get("locker", "")).strip():
        errors.append(GqlError("Wybierz paczkomat.", field="locker"))
    if not str(v.get("payment", "")).strip():
        errors.append(GqlError("Wybierz metodę płatności.", field="payment"))
    if errors:
        raise _Multi(errors)
    if not captcha.verify(s, str(v.get("captcha_token", ""))):
        raise GqlError("Potwierdź, że nie jesteś robotem.", "CAPTCHA", "captcha_token")
    with STORE.lock:
        orders = STORE.data["orders"]
        order = {
            "id": f"ZAM-{len(orders) + 1:05d}",
            "date": TODAY,
            "user": s.user,
            "items": cart["items"],
            "total": cart["total"],
            "delivery_cost": cart["delivery_cost"],
            "grand_total": cart["grand_total"],
            "delivery": delivery,
            "locker": v.get("locker") if delivery == "paczkomat" else None,
            "city": v["city"],
            "postal_code": v["postal_code"],
            "email": v["email"],
            "name": v["name"],
            "payment": v["payment"],
        }
        orders.append(order)
        lines.clear()
    return {
        "placeOrder": {"id": order["id"], "total": order["grand_total"]},
        "cart": _cart_view(request),
    }


class _Multi(Exception):
    def __init__(self, errors: list[GqlError]):
        self.errors = errors


def _run(request: HttpRequest, op: str, v: dict[str, Any]) -> dict[str, Any]:
    with STORE.lock:
        if op == "Catalog":
            return {"catalog": _catalog(v)}
        if op == "Product":
            p = _product(str(v.get("slug", "")))
            if p is None:
                raise GqlError("Nie znaleziono produktu.", "NOT_FOUND", "slug")
            return {"product": _public(p)}
        if op == "Cart":
            return {"cart": _cart_view(request)}
        if op == "AddToCart":
            return _add_to_cart(request, v)
        if op == "UpdateCart":
            return _update_cart(request, v)
        if op == "PlaceOrder":
            return _place_order(request, v)
    raise GqlError(f"Nieznana operacja: {op}", "UNKNOWN_OPERATION")


@csrf_exempt
def graphql(request: HttpRequest) -> JsonResponse:
    # Always 200, as GraphQL does (LO-42): the outcome is in ``errors``.
    if request.method != "POST":
        return JsonResponse({"data": None, "errors": [{"message": "Użyj metody POST."}]})
    try:
        body = json.loads(request.body or b"{}")
        op = str(body.get("operationName", ""))
        variables = body.get("variables") or {}
        if not isinstance(variables, dict):
            raise ValueError
    except ValueError:
        return JsonResponse({"data": None, "errors": [{"message": "Nieprawidłowe zapytanie."}]})
    try:
        return JsonResponse({"data": _run(request, op, variables), "errors": []})
    except GqlError as e:
        return JsonResponse({"data": None, "errors": [e.payload()]})
    except _Multi as e:
        return JsonResponse({"data": None, "errors": [x.payload() for x in e.errors]})


def lockers(request: HttpRequest) -> JsonResponse:
    city = request.GET.get("miasto", "")
    found = _shop()["lockers"].get(city, [])
    return JsonResponse({"miasto": city, "lockers": found, "cities": list(_shop()["lockers"])})


@require_api("shop")
def orders(request: HttpRequest) -> JsonResponse:
    uid = session_of(request).user
    mine = [o for o in STORE.data["orders"] if o["user"] == uid]
    return JsonResponse({"orders": list(reversed(mine))})


urlpatterns = [
    path("api/shop/graphql", graphql),
    path("api/shop/lockers", lockers),
    path("api/shop/orders", orders),
]
