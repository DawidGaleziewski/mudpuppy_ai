"""Settings read models (spec 022 T031): stored credentials (names only), personas of a portal,
and the crawl rules read from the portal file."""

from __future__ import annotations

import json
from pathlib import Path

from pathfinder_dashboard import queries_settings

from .conftest import Store, insert, ts
from .paths import REPO_ROOT


def test_stored_credentials_list_names_never_values(empty_store: Store) -> None:
    conn = empty_store.connect()
    for portal, env, name, minute in (
        ("shop", "staging", "SHOP_PASSWORD", 2),
        ("shop", "staging", "SHOP_LOGIN", 1),
        ("other", "staging", "OTHER_TOKEN", 3),
    ):
        insert(
            conn,
            "credentials",
            id=f"c{minute}",
            portal_id=portal,
            environment=env,
            ref_name=name,
            ciphertext=b"secret-bytes-not-real",
            nonce=b"0" * 12,
            key_id="abcdef01",
            created_at=ts(minute),
            updated_at=ts(minute),
        )
    conn.commit()
    conn.close()
    ro = empty_store.connect()
    rows = queries_settings.stored_credentials(ro, "shop")
    ro.close()
    assert [(r.name, r.environment, r.saved_at) for r in rows] == [
        ("SHOP_LOGIN", "staging", ts(1)),
        ("SHOP_PASSWORD", "staging", ts(2)),
    ]
    assert not hasattr(rows[0], "ciphertext")


def test_personas_have_a_kind_and_credential_refs(tmp_path: Path) -> None:
    root = tmp_path / "personas"
    (root / "_mixins").mkdir(parents=True)
    (root / "shop").mkdir()
    (root / "_mixins" / "anon.yaml").write_text("auth: none\n")
    (root / "shop" / "guest.yaml").write_text("extends: ['../_mixins/anon.yaml']\n")
    (root / "shop" / "client.yaml").write_text(
        "auth:\n  login: ref:SHOP_LOGIN\n  password: ref:SHOP_PASSWORD\n"
    )
    rows = queries_settings.persona_rows(root, "shop")
    assert [(p.id, p.kind, p.refs) for p in rows] == [
        ("client", "logged-in", ["SHOP_LOGIN", "SHOP_PASSWORD"]),
        ("guest", "anonymous", []),
    ]
    assert queries_settings.persona_rows(root, "nope") == []
    assert queries_settings.persona_rows(root, "../x") == []


def test_persona_attributes_merge_per_key_through_extends(tmp_path: Path) -> None:
    """Spec 024 US1.1: the mixin's attributes first, the file's own win per key."""
    root = tmp_path / "personas"
    (root / "shop" / "_mixins").mkdir(parents=True)
    (root / "shop" / "_mixins" / "login.yaml").write_text(
        "auth: { login: ref:A, password: ref:B }\nattributes: { tariff: basic, region: EU }\n"
    )
    (root / "shop" / "anna.yaml").write_text(
        "extends: ['_mixins/login.yaml']\nattributes: { tariff: premium, features: [export] }\n"
    )
    [anna] = queries_settings.persona_rows(root, "shop")
    assert anna.kind == "logged-in"
    assert anna.attributes == {"tariff": "premium", "region": "EU", "features": ["export"]}


def test_persona_merge_matches_the_loader_on_the_shared_fixture() -> None:
    """Spec 024 F-06: the TypeScript loader is checked against the same tree
    (`packages/config/tests/persona-merge-shared.test.ts`)."""
    root = REPO_ROOT / "apps/crawler/tests/fixtures/personas/extends"
    want = json.loads((root / "expected.json").read_text())
    rows = queries_settings.persona_rows(root, want["portal"])
    got = {
        p.id: {"attributes": p.attributes, "logged_in": p.kind == "logged-in", "refs": p.refs}
        for p in rows
    }
    assert got == want["personas"]


def test_crawl_rules_from_the_portal_file(tmp_path: Path) -> None:
    (tmp_path / "wiki").mkdir()
    (tmp_path / "wiki" / "portal.yaml").write_text(
        "id: wiki\nrobots: respect\nscope:\n  allowed_domains: [a.org]\n"
        "urls:\n  allowed: ['/wiki/*']\n  disallowed: ['/w/*']\ndenylist:\n  - logout\n"
    )
    (tmp_path / "bare").mkdir()
    (tmp_path / "bare" / "portal.yaml").write_text("id: bare\n")
    rules = queries_settings.crawl_rules(tmp_path, "wiki")
    assert rules.robots == "respect"
    assert rules.domains == ["a.org"] and rules.allowed_urls == ["/wiki/*"]
    assert rules.disallowed_urls == ["/w/*"]
    bare = queries_settings.crawl_rules(tmp_path, "bare")
    # no allowed list at all means everything on the allowed domains, not "nothing"
    assert bare.robots == "ignore" and bare.allowed_urls is None and bare.disallowed_urls == []
    assert queries_settings.crawl_rules(tmp_path, "missing") is None


def test_hints_from_the_portal_files_model_section(tmp_path: Path) -> None:
    """Spec 039 G11 / OV-2: release marker, A/B cookies (a confirmed A/B test adds one)."""
    (tmp_path / "shop").mkdir()
    (tmp_path / "shop" / "portal.yaml").write_text(
        "id: shop\nmodel:\n  build_marker: {header: x-app-version}\n"
        "  experiment_flags: [{cookie: ab_calc}, {storage: exp.hero}]\n"
        "  business_errors: [{text: Nie możemy Cię ubezpieczyć}]\n"
    )
    (tmp_path / "bare").mkdir()
    (tmp_path / "bare" / "portal.yaml").write_text("id: bare\n")
    h = queries_settings.hints(tmp_path, "shop")
    assert h and h.release_marker == "header x-app-version"
    assert h.ab_flags == ["cookie ab_calc", "storage exp.hero"]
    assert h.refusals == ["Nie możemy Cię ubezpieczyć"]
    assert queries_settings.hints(tmp_path, "bare") == queries_settings.Hints(None, [], [])
    assert queries_settings.hints(tmp_path, "missing") is None
