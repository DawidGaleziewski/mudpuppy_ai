"""Read models for a portal's Settings page (spec 022 T031, screen 11): the credentials stored in
the vault (names only, never a value, never the ciphertext), the portal's personas, and its crawl
rules read from the portal file. Writes go through the chat service."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import queries_chat


@dataclass(frozen=True)
class StoredCredential:
    name: str
    environment: str
    saved_at: str


def stored_credentials(conn: sqlite3.Connection, portal: str) -> list[StoredCredential]:
    """Which credentials the vault holds for the portal. Selects no value column on purpose."""
    try:
        rows = conn.execute(
            "SELECT ref_name, environment, updated_at FROM credentials WHERE portal_id = ? "
            "ORDER BY environment, ref_name",
            (portal,),
        ).fetchall()
    except sqlite3.OperationalError:  # a store made before migration 0007
        return []
    return [StoredCredential(r[0], r[1], r[2]) for r in rows]


@dataclass(frozen=True)
class PersonaRow:
    id: str
    kind: str  # "anonymous" | "logged-in"
    refs: list[str]
    # What decides this user's access (spec 024 US1): shown as written, never interpreted.
    attributes: dict[str, Any]


def _layers(path: Path, root: Path, depth: int = 0) -> list[dict[str, Any]]:
    """The persona file and its mixins in merge order: `extends` depth first, the file last."""
    doc = queries_chat._load_yaml(path)
    if not isinstance(doc, dict):
        return []
    out: list[dict[str, Any]] = []
    extends = doc.get("extends")
    for rel in extends if isinstance(extends, list) and depth < 4 else []:
        target = (path.parent / str(rel)).resolve()
        if target.is_relative_to(root) and target.is_file():
            out += _layers(target, root, depth + 1)
    return [*out, doc]


def _merge(base: dict[str, Any], over: dict[str, Any]) -> dict[str, Any]:
    """The loader's merge (`load-persona.ts`): objects merge key by key, scalars and lists are
    replaced. Both are checked against `apps/crawler/tests/fixtures/personas/extends` (F-06)."""
    out = dict(base)
    for key, value in over.items():
        both = isinstance(value, dict) and isinstance(out.get(key), dict)
        out[key] = _merge(out[key], value) if both else value
    return out


def resolved_persona(path: Path, root: Path) -> dict[str, Any]:
    """A persona file merged through its `extends`, the file last."""
    merged: dict[str, Any] = {}
    for layer in _layers(path, root):
        merged = _merge(merged, {k: v for k, v in layer.items() if k != "extends"})
    return merged


def persona_rows(personas_dir: Path, portal: str | None) -> list[PersonaRow]:
    root = personas_dir.resolve()
    out = []
    for p in queries_chat.list_personas(personas_dir, portal):
        persona = resolved_persona(root / str(portal) / f"{p.id}.yaml", root)
        auth = persona.get("auth")
        refs: list[str] = []
        queries_chat._collect_refs(auth, refs)
        kind = "logged-in" if auth not in (None, "none") else "anonymous"
        attributes = persona.get("attributes")
        out.append(
            PersonaRow(p.id, kind, sorted(refs), attributes if isinstance(attributes, dict) else {})
        )
    return out


def attributes_line(attributes: dict[str, Any]) -> str:
    """`tariff: basic · features: export, share`; attributes as written, never interpreted."""
    parts = []
    for key, value in attributes.items():
        shown = ", ".join(str(v) for v in value) if isinstance(value, list) else str(value)
        parts.append(f"{key}: {shown}")
    return " · ".join(parts)


def attributes_by_persona(personas_dir: Path, portal: str) -> dict[str, str]:
    """persona id → its attributes line; personas without attributes are left out (spec 024)."""
    rows = persona_rows(personas_dir, portal)
    return {r.id: attributes_line(r.attributes) for r in rows if r.attributes}


@dataclass(frozen=True)
class CrawlRules:
    robots: str  # "respect" | "ignore"
    domains: list[str]
    allowed_urls: list[str] | None  # None = no list: everything on the allowed domains
    disallowed_urls: list[str]


def _strings(value: Any) -> list[str]:
    return [v for v in value if isinstance(v, str)] if isinstance(value, list) else []


def crawl_rules(portals_dir: Path, portal: str) -> CrawlRules | None:
    """The portal file's robots choice and URL lists; None when the file can't be read."""
    if not queries_chat._SAFE_ID.match(portal):
        return None
    path = portals_dir / portal / "portal.yaml"
    doc = queries_chat._load_yaml(path) if path.is_file() else None
    if not isinstance(doc, dict):
        return None
    scope = doc.get("scope") if isinstance(doc.get("scope"), dict) else {}
    urls = doc.get("urls") if isinstance(doc.get("urls"), dict) else {}
    return CrawlRules(
        robots="respect" if doc.get("robots") == "respect" else "ignore",
        domains=_strings(scope.get("allowed_domains")),
        allowed_urls=_strings(urls.get("allowed"))
        if isinstance(urls.get("allowed"), list)
        else None,
        disallowed_urls=_strings(urls.get("disallowed")),
    )


@dataclass(frozen=True)
class Hints:
    """Settings ▸ Hints (spec 039 G11): what the portal model is told about the portal."""

    release_marker: str | None  # "header x-app-version" · "meta app-version"
    ab_flags: list[str]  # "cookie ab_calc" · "storage exp.hero"; confirmed A/B tests add theirs
    refusals: list[str]  # texts that make a page a business error
    # Spec 040 T021: the form's fields, and Budgets (the portal schema's defaults when unset).
    marker_header: str = ""
    marker_meta: str = ""
    checks_per_scan: int = 20  # model.replay_budget: deterministic replays per run
    probes_per_step: int = 24  # probes.per_step
    probes_per_scan: int = 120  # probes.per_run


def _section(doc: dict[str, Any], key: str) -> dict[str, Any]:
    value = doc.get(key)
    return value if isinstance(value, dict) else {}


def hints(portals_dir: Path, portal: str) -> Hints | None:
    """The portal file's `model:` hooks; None when the file can't be read."""
    if not queries_chat._SAFE_ID.match(portal):
        return None
    path = portals_dir / portal / "portal.yaml"
    doc = queries_chat._load_yaml(path) if path.is_file() else None
    if not isinstance(doc, dict):
        return None
    model = _section(doc, "model")
    marker = _section(model, "build_marker")
    where = [f"{k} {marker[k]}" for k in ("header", "meta") if isinstance(marker.get(k), str)]
    flags = model.get("experiment_flags")
    errors = model.get("business_errors")
    probes = _section(doc, "probes")

    def number(section: dict[str, Any], key: str, default: int) -> int:
        value = section.get(key)
        return value if isinstance(value, int) and not isinstance(value, bool) else default

    return Hints(
        marker_header=str(marker.get("header") or ""),
        marker_meta=str(marker.get("meta") or ""),
        checks_per_scan=number(model, "replay_budget", 20),
        probes_per_step=number(probes, "per_step", 24),
        probes_per_scan=number(probes, "per_run", 120),
        release_marker=" · ".join(where) or None,
        ab_flags=[
            f"{k} {f[k]}"
            for f in (flags if isinstance(flags, list) else [])
            if isinstance(f, dict)
            for k in ("cookie", "storage")
            if isinstance(f.get(k), str)
        ],
        refusals=[
            e["text"]
            for e in (errors if isinstance(errors, list) else [])
            if isinstance(e, dict) and isinstance(e.get("text"), str)
        ],
    )
