"""What every router shares (guideline G-13): the per-request `Ctx` (which store, its connection)
and the `Web` object on `app.state` that holds the settings, the chat transport and the glossary.

Routers get it with `web_of(request)`; they never import another router.
"""

from __future__ import annotations

import re
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path
from urllib.parse import urlsplit

import httpx2
from fastapi import Request

from .. import as_of as asof
from .. import db, glossary, stores
from ..settings import Settings

PORTAL_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def same_origin(request: Request) -> bool:
    """The dashboard has no login, so a write must come from its own pages: `Origin` (or,
    failing that, `Referer`) has to name this very host:port. Neither present: refused."""
    host = request.headers.get("host", "")
    for header in ("origin", "referer"):
        value = request.headers.get(header)
        if value:
            return urlsplit(value).netloc == host
    return False


@dataclass
class Ctx:
    """Per-request context: which store (the main one, or an eval workspace, spec 019)."""

    request: Request
    settings: Settings
    store: stores.Store
    # The portal a route works on when its address does not name it (`?portal=`).
    portal: str | None = None
    # Why the store asked for is not the one shown (a deleted eval workspace, spec 019).
    store_note: str | None = None

    @property
    def env(self) -> str:
        return self.store.env

    @property
    def data_dir(self) -> Path:
        """The chosen store's data directory: the main one, or an eval workspace's (spec 019)."""
        return self.store.data_dir

    @cached_property
    def as_of(self) -> asof.Version | None:
        """The past model version `?as_of=` names on a model page's API (spec 040 FR-001); None:
        Now (no such version, the latest one, or another address)."""
        seq = self.request.query_params.get("as_of")
        portal = asof.follows(self.request.url.path)
        if not seq or not portal or self.request.method != "GET":
            return None
        try:
            with self.conn(now=True) as conn:
                return asof.find(conn, portal, seq)
        except db.StoreMissing:
            return None

    @contextmanager
    def conn(self, now: bool = False) -> Iterator[sqlite3.Connection]:
        """The store, read-only; on a model page As of a past version, only what existed then."""
        past = None if now else self.as_of
        shadow = (lambda c: asof.shadow(c, past.built_at)) if past else None
        conn = db.connect(self.data_dir, self.env, shadow)
        try:
            yield conn
        finally:
            conn.close()


class Web:
    """The app-wide helpers the routers share; one instance on `app.state.web`."""

    def __init__(
        self, settings: Settings, chat_transport: httpx2.AsyncBaseTransport | None = None
    ) -> None:
        self.settings = settings
        # Replaces the network to the chat service (tests mock it); None = the real one.
        self.chat_transport = chat_transport
        # Glossary (spec 006): loaded once; re-read per request in dev so edits show on reload.
        self._glossary = glossary.load_glossary(settings.docs_dir)

    def current_glossary(self) -> glossary.Glossary | glossary.GlossaryError:
        if self.settings.dev:
            self._glossary = glossary.load_glossary(self.settings.docs_dir)
        return self._glossary

    def glossary_or_none(self) -> glossary.Glossary | None:
        g = self.current_glossary()
        return g if isinstance(g, glossary.Glossary) else None

    def ctx(self, request: Request, env: str | None) -> Ctx:
        """The store a request asks for (`?store=`, else `?env=`, else the default one)."""
        s = self.settings
        store, note = stores.resolve_store(
            s.data_dir, s.eval_root, request.query_params.get("store"), env, s.default_env
        )
        portal = request.query_params.get("portal")
        chosen = portal if portal and PORTAL_ID.match(portal) else None
        return Ctx(request, s, store, portal=chosen, store_note=note)


def web_of(request: Request) -> Web:
    web: Web = request.app.state.web
    return web
