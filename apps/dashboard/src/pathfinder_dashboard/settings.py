"""Runtime settings. The dashboard binds to the local machine only (FR-012)."""

from __future__ import annotations

import tempfile
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def find_data_dir(start: Path | None = None) -> Path:
    """The nearest ancestor's `data/` that holds `migrations/` (the repo's data dir)."""
    here = (start or Path(__file__)).resolve()
    for parent in (here, *here.parents):
        candidate = parent / "data"
        if (candidate / "migrations").is_dir():
            return candidate
    return Path.cwd() / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PATHFINDER_", extra="ignore")

    data_dir: Path = Field(default_factory=find_data_dir)
    default_env: str = "production"
    host: str = "127.0.0.1"
    port: int = 8765
    dev: bool = False
    # How often the live stream checks the store for commits, and how often it pings.
    poll_interval_s: float = 1.0
    keepalive_s: float = 15.0
    # Items per page on every paged list (R-71: 25, owner 2026-10-17).
    page_size: int = 25
    # Ends each event stream after this many seconds; None in normal use (tests set it).
    sse_max_s: float | None = None
    # The name signed on review actions and process changes (spec 004 US3). "unknown" by default
    # so nobody has to set it each start (owner 2026-10-18); None turns those actions off.
    reviewer: str | None = "unknown"
    # Where `pnpm docs:review` runs; the dashboard never writes the store (constitution 1.4.0).
    crawler_dir: Path = Field(default_factory=lambda: find_data_dir().parent / "apps" / "crawler")
    review_timeout_s: float = 10.0
    # The local chat service (apps/chat, spec 010), called server-side only.
    chat_url: str = "http://127.0.0.1:4310"
    chat_timeout_s: float = 10.0
    # Persona YAML files, read to list the `ref:NAME` credentials a persona needs (spec 010 T020).
    personas_dir: Path = Field(default_factory=lambda: find_data_dir().parent / "personas")
    # Portal configs (`<id>/portal.yaml`), listed in the header's portal dropdown (spec 011).
    portals_dir: Path = Field(default_factory=lambda: find_data_dir().parent / "portals")
    # Glossary, its long pages and the BA wiki (spec 006): authored content, read-only here.
    docs_dir: Path = Field(default_factory=lambda: find_data_dir().parent / "docs")
    # Where `pnpm eval` leaves its workspaces (`pf-eval-<portal>-*`), listed in the store picker
    # (spec 019 US5); None turns the listing off.
    eval_root: Path | None = Field(default_factory=lambda: Path(tempfile.gettempdir()))
