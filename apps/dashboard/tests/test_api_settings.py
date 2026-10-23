"""The React console's Settings (R-96, spec 068): the page's data as the htmx Settings reads it
(environments through the chat service, credentials by name only, personas, crawl rules, hints,
screen identity, the store), and the writes through the chat service (mocked)."""

from __future__ import annotations

import json
from pathlib import Path

import httpx2
from fastapi.testclient import TestClient

from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings

from .conftest import Store
from .test_chat import ORIGIN, Service
from .test_settings_salvage import SECRET, client, up, world  # noqa: F401  (the fixture)

API = "/api/portals/shop"
World = tuple[Store, Path, Path]


def signed(world: World, service: Service) -> TestClient:  # noqa: F811
    store, portals, personas = world
    settings = Settings(
        data_dir=store.data_dir,
        default_env=store.env,
        portals_dir=portals,
        personas_dir=personas,
        reviewer="Anna",
    )
    return TestClient(create_app(settings, chat_transport=httpx2.MockTransport(service)))


def test_the_page_has_every_part(world: World) -> None:  # noqa: F811
    with client(world) as c:
        r = c.get(f"{API}/settings")
    body = r.json()
    assert body["service_up"] and body["start_hint"] is None and body["error"] is None
    names = [e["name"] for e in body["environments"]]
    assert names and all(e["can_revoke"] == (len(names) > 1) for e in body["environments"])
    assert body["environments"][0]["robots"] == "respect it"
    assert set(body["missing"]) | set(names) == {"production", "staging", "sandbox"}
    assert body["credentials"] == [
        {
            "value": "SHOP_LOGIN",
            "label": f"staging · {body['credentials'][0]['label'].split(' · ')[1]}",
        }
    ]
    assert SECRET not in r.text
    client_persona = next(p for p in body["personas"] if p["id"] == "client")
    assert client_persona["refs"] == ["SHOP_LOGIN"]
    assert {"value": "features", "label": "export, share"} in client_persona["attributes"]
    assert body["rules"]["domains"] == ["shop.example.pl"]
    assert body["hints"]["checks_per_scan"] == 20
    assert body["identity"]["tau"] is None and body["store"]["exists"]
    assert body["not_configured"]["word"] == "Not configured"


def test_a_stopped_chat_service_says_how_to_start_it(world: World) -> None:  # noqa: F811
    store, portals, personas = world
    settings = Settings(
        data_dir=store.data_dir, default_env=store.env, portals_dir=portals, personas_dir=personas
    )

    def down(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError("refused", request=request)

    with TestClient(create_app(settings, chat_transport=httpx2.MockTransport(down))) as c:
        body = c.get(f"{API}/settings").json()
    assert not body["service_up"] and "pnpm --dir apps/chat start" in body["start_hint"]
    assert body["environments"] == [] and body["personas"]


def test_environments_are_saved_and_revoked_through_the_chat_service(
    world: World,  # noqa: F811
) -> None:
    service = up()
    service.routes[("PUT", "/portals/shop/environments/staging")] = httpx2.Response(200, json={})
    service.routes[("DELETE", "/portals/shop/environments/sandbox")] = httpx2.Response(
        409, json={"message": "the last environment stays"}
    )
    with signed(world, service) as c:
        saved = c.post(
            f"{API}/environments",
            json={
                "environment": "staging",
                "base_url": "https://staging.example.test",
                "limit": "read",
            },
            headers=ORIGIN,
        )
        bad = c.post(f"{API}/environments", json={"environment": "qa"}, headers=ORIGIN)
        kept = c.post(f"{API}/environments/sandbox/revoke", json={}, headers=ORIGIN)
        foreign = c.post(f"{API}/environments/sandbox/revoke", json={})
    assert saved.json() == {"ok": True, "message": "staging saved.", "href": None}
    assert bad.status_code == 422 and foreign.status_code == 403
    assert kept.status_code == 409 and "the last environment stays" in kept.json()["message"]
    put = next(q for q in service.requests if q.method == "PUT")
    assert json.loads(put.content) == {
        "base_url": "https://staging.example.test",
        "max_action_class": "read",
    }


def test_hints_budgets_and_accepting_go_through_the_chat_service(world: World) -> None:  # noqa: F811
    service = up()
    service.routes[("PUT", "/portals/shop/hints")] = httpx2.Response(200, json={})
    service.routes[("POST", "/portals/shop/model/accept")] = httpx2.Response(201, json={})
    with signed(world, service) as c:
        hints = c.post(
            f"{API}/hints/hints",
            json={
                "marker_header": "x-app-version",
                "marker_meta": "",
                "ab_flags": "cookie ab_calc\nexp.hero",
                "refusals": "Nie możemy\n",
            },
            headers=ORIGIN,
        )
        budgets = c.post(
            f"{API}/hints/budgets",
            json={"checks_per_scan": "5", "probes_per_step": "12", "probes_per_scan": "60"},
            headers=ORIGIN,
        )
        bad = c.post(
            f"{API}/hints/budgets",
            json={"checks_per_scan": "-1", "probes_per_step": "12", "probes_per_scan": "60"},
            headers=ORIGIN,
        )
        accepted = c.post(f"{API}/model/accept", json={"what": "tau"}, headers=ORIGIN)
    assert hints.json()["message"] == "Hints saved." and budgets.json()["ok"]
    assert bad.status_code == 422 and "whole number" in bad.json()["message"]
    assert accepted.json()["message"] == "The calibrated τ is in force from the next rebuild."
    sent = [json.loads(q.content) for q in service.requests if q.url.path == "/portals/shop/hints"]
    assert sent[0]["experiment_flags"] == [
        {"kind": "cookie", "name": "ab_calc"},
        {"kind": "cookie", "name": "exp.hero"},
    ]
    assert sent[1] == {"replay_budget": 5, "probes": {"per_step": 12, "per_run": 60}}
    (accept,) = [q for q in service.requests if q.url.path.endswith("/model/accept")]
    assert json.loads(accept.content) == {"what": "tau", "by": "Anna"}
