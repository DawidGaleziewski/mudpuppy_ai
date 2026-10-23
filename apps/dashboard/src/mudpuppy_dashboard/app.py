"""FastAPI app: the React console's JSON API (`web/api_*.py`, one router per page; guideline
G-13), the chat relay, evidence files, the console itself at `/app/`, and redirects from the old
addresses (R-100, spec 071: the console is a React single-page app, no server-rendered pages).

Reads are read-only on the store; every write goes to the chat service (spec 010), which is the
only writer.
"""

from __future__ import annotations

import httpx2
from fastapi import FastAPI

from .settings import Settings
from .web import (
    api_amendments,
    api_app,
    api_assistant,
    api_changes,
    api_docs,
    api_errors,
    api_glossary,
    api_lists,
    api_map,
    api_plan,
    api_portal_new,
    api_process,
    api_process_export,
    api_processes,
    api_recorded,
    api_review,
    api_review_items,
    api_rules,
    api_same_screen,
    api_scan,
    api_scan_tabs,
    api_scan_trace,
    api_screens,
    api_settings,
    api_state,
    api_workbench,
    api_writes,
    chat_relay,
    evidence,
    health,
    legacy,
    spa,
)
from .web.deps import Web

__all__ = ["create_app"]


def create_app(
    settings: Settings | None = None,
    chat_transport: httpx2.AsyncBaseTransport | None = None,
) -> FastAPI:
    """`chat_transport` replaces the network to the chat service (tests mock it)."""
    settings = settings or Settings()
    app = FastAPI(title="mudpuppy", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    # Shared helpers (web/deps.py); the routers get them with `web_of(request)`.
    app.state.web = Web(settings, chat_transport)

    # Order matters where paths overlap, inside a router and between them.
    app.include_router(health.router)
    app.include_router(evidence.router)
    app.include_router(chat_relay.router)
    app.include_router(api_portal_new.router)  # /api/portals/new before /api/portals/{portal}/…
    app.include_router(api_app.router)
    # Before api_screens: its /screens/{key} would take /screens/recorded.
    app.include_router(api_recorded.router)
    app.include_router(api_screens.router)
    app.include_router(api_map.router)
    app.include_router(api_processes.router)
    app.include_router(api_process.router)
    app.include_router(api_review.router)
    app.include_router(api_review_items.router)
    app.include_router(api_changes.router)
    app.include_router(api_rules.router)
    app.include_router(api_docs.router)
    app.include_router(api_settings.router)
    app.include_router(api_assistant.router)
    app.include_router(api_scan.router)
    app.include_router(api_scan_tabs.router)
    app.include_router(api_scan_trace.router)
    app.include_router(api_writes.router)
    app.include_router(api_state.router)
    app.include_router(api_amendments.router)
    app.include_router(api_same_screen.router)
    app.include_router(api_plan.router)
    app.include_router(api_errors.router)
    app.include_router(api_process_export.router)
    app.include_router(api_lists.router)
    app.include_router(api_glossary.router)
    app.include_router(api_workbench.router)
    app.include_router(spa.router)
    # Last: the old addresses, each a redirect to its page in the console.
    app.include_router(legacy.router)
    return app
