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


def _auth(path: Path, root: Path, depth: int = 0) -> Any:
    """The persona's `auth` value: its own, else the first one found in its mixins."""
    doc = queries_chat._load_yaml(path)
    if not isinstance(doc, dict):
        return None
    if "auth" in doc:
        return doc["auth"]
    extends = doc.get("extends")
    for rel in extends if isinstance(extends, list) and depth < 4 else []:
        target = (path.parent / str(rel)).resolve()
        if target.is_relative_to(root) and target.is_file():
            found = _auth(target, root, depth + 1)
            if found is not None:
                return found
    return None


def persona_rows(personas_dir: Path, portal: str | None) -> list[PersonaRow]:
    root = personas_dir.resolve()
    out = []
    for p in queries_chat.list_personas(personas_dir, portal):
        auth = _auth(root / str(portal) / f"{p.id}.yaml", root)
        logged_in = bool(p.refs) or auth not in (None, "none")
        out.append(PersonaRow(p.id, "logged-in" if logged_in else "anonymous", p.refs))
    return out


@dataclass(frozen=True)
class CrawlRules:
    robots: str  # "respect" | "ignore"
    domains: list[str]
    allowed_paths: list[str]
    disallowed_paths: list[str]


def _strings(value: Any) -> list[str]:
    return [v for v in value if isinstance(v, str)] if isinstance(value, list) else []


def crawl_rules(portals_dir: Path, portal: str) -> CrawlRules | None:
    """The portal file's robots choice and path rules; None when the file can't be read."""
    if not queries_chat._SAFE_ID.match(portal):
        return None
    path = portals_dir / portal / "portal.yaml"
    doc = queries_chat._load_yaml(path) if path.is_file() else None
    if not isinstance(doc, dict):
        return None
    scope = doc.get("scope") if isinstance(doc.get("scope"), dict) else {}
    denied = [d[len("path:") :] for d in _strings(doc.get("denylist")) if d.startswith("path:")]
    return CrawlRules(
        robots="respect" if doc.get("robots") == "respect" else "ignore",
        domains=_strings(scope.get("allowed_domains")),
        allowed_paths=_strings(scope.get("allowed_paths")),
        disallowed_paths=denied,
    )
