"""What every page router shares (guideline G-13): the per-request `Ctx`, link building, and the
`Web` object on `app.state` that renders templates and holds the glossary.

Routers get it with `web_of(request)`; they never import another router.
"""

from __future__ import annotations

import re
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlsplit

import httpx2
from fastapi import Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from .. import db, glossary, queries_chat, stores
from ..settings import Settings

# The header's portal choice (spec 011): kept in a cookie; "" means all portals.
PORTAL_COOKIE = "pf_portal"
PORTAL_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def chosen_portal(request: Request) -> str | None:
    """`?portal=` wins over the cookie; an empty value is "all portals"."""
    value = request.query_params.get("portal")
    if value is None:
        value = request.cookies.get(PORTAL_COOKIE)
    return value if value and PORTAL_ID.match(value) else None


def _clean(params: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in params.items() if v not in (None, "", False) and v != []}


def build_url(path: str, **params: Any) -> str:
    """`doseq=True` so a list value (repeatable filters like `tool`/`status`) becomes one
    `k=v` pair per item instead of one mangled param; scalar strings are unaffected."""
    query = urlencode(_clean(params), doseq=True)
    return f"{path}?{query}" if query else path


def same_origin(request: Request) -> bool:
    """The dashboard has no login, so a form post must come from its own pages: `Origin` (or,
    failing that, `Referer`) has to name this very host:port. Neither present: refused."""
    host = request.headers.get("host", "")
    for header in ("origin", "referer"):
        value = request.headers.get(header)
        if value:
            return urlsplit(value).netloc == host
    return False


@dataclass
class Ctx:
    """Per-request context: which store, and helpers that keep the store on every link."""

    request: Request
    settings: Settings
    store: stores.Store
    extra: dict[str, Any] = field(default_factory=dict)
    # The header's portal choice (spec 011): `?portal=` or the cookie; None = all portals.
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

    @property
    def stores(self) -> list[stores.Store]:
        return stores.list_stores(self.settings.data_dir, self.settings.eval_root)

    @property
    def store_param(self) -> str | None:
        """`store` goes into links only when it is not the default one."""
        default = db.resolve_env(self.settings.data_dir, None, self.settings.default_env)
        if self.store.kind == "main" and self.store.env == default:
            return None
        return self.store.key

    def url(self, path: str, **params: Any) -> str:
        return build_url(path, store=self.store_param, **params)

    @contextmanager
    def conn(self) -> Iterator[sqlite3.Connection]:
        conn = db.connect(self.data_dir, self.env)
        try:
            yield conn
        finally:
            conn.close()


class Web:
    """The app-wide helpers the page routers share; one instance on `app.state.web`."""

    def __init__(
        self,
        settings: Settings,
        templates: Jinja2Templates,
        chat_transport: httpx2.AsyncBaseTransport | None = None,
    ) -> None:
        self.settings = settings
        self.templates = templates
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
        s = self.settings
        store, note = stores.resolve_store(
            s.data_dir, s.eval_root, request.query_params.get("store"), env, s.default_env
        )
        return Ctx(request, s, store, portal=chosen_portal(request), store_note=note)

    def header_portals(self, c: Ctx) -> list[str]:
        try:
            with c.conn() as conn:
                return queries_chat.known_portals(conn, self.settings.portals_dir)
        except db.StoreMissing:
            return queries_chat.known_portals(None, self.settings.portals_dir)

    def render(
        self, c: Ctx, template: str, status_code: int = 200, push: str | None = None, **values: Any
    ) -> HTMLResponse:
        settings = self.settings
        response = self.templates.TemplateResponse(
            c.request,
            template,
            {
                "c": c,
                "env": c.env,
                "dev": settings.dev,
                "store": db.store_info(c.data_dir, c.env),
                # Spec 011: called by the header only, so fragment polls do not pay for it.
                "header_portals": lambda: self.header_portals(c),
                # [settings] only for a portal with a config file (a scanned-only one has none)
                "portal_configured": lambda p: bool(
                    p
                    and PORTAL_ID.match(p)
                    and (settings.portals_dir / p / "portal.yaml").is_file()
                ),
                **values,
            },
            status_code=status_code,
        )
        response.headers["Cache-Control"] = "no-store"
        if push:
            response.headers["HX-Push-Url"] = push
        return response

    def missing(self, c: Ctx, err: db.StoreMissing, fragment: bool = False) -> HTMLResponse:
        return self.render(
            c,
            "partials/states/store_missing.html" if fragment else "store_missing.html",
            path=str(err.path),
        )

    def not_found(self, c: Ctx, run_id: str, fragment: bool = False) -> HTMLResponse:
        template = "partials/states/not_found.html" if fragment else "not_found.html"
        return self.render(c, template, status_code=404, run_id=run_id)


def web_of(request: Request) -> Web:
    web: Web = request.app.state.web
    return web
