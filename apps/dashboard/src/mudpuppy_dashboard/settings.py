"""Runtime settings. The dashboard binds to the local machine only (FR-012)."""

from __future__ import annotations

import getpass
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


def _login_name() -> str:
    """The computer's login name, or "unknown" where there is none (a container, a service)."""
    try:
        return getpass.getuser() or "unknown"
    except (OSError, KeyError):
        return "unknown"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MUDPUPPY_", extra="ignore")

    data_dir: Path = Field(default_factory=find_data_dir)
    default_env: str = "production"
    host: str = "127.0.0.1"
    port: int = 8765
    dev: bool = False
    # Items per page on every paged list (R-71: 25, owner 2026-10-17).
    page_size: int = 25
    # The name signed on review actions, process changes and confirmed commands (spec 004 US3).
    # Nobody has to set it each start (owner 2026-10-18): the computer's login name by default
    # (spec 073 D-1, R-103 (2): "confirmed_by = unknown" on every command), "unknown" without one;
    # None turns those actions off.
    reviewer: str | None = Field(default_factory=_login_name)
    # Where `pnpm docs:review` runs; the dashboard never writes the store (constitution 1.4.0).
    crawler_dir: Path = Field(default_factory=lambda: find_data_dir().parent / "apps" / "crawler")
    review_timeout_s: float = 10.0
    # The local chat service (apps/chat, spec 010), called server-side only.
    chat_url: str = "http://127.0.0.1:4310"
    chat_timeout_s: float = 10.0
    # The Workbench beta (spec 043 D-4, designer 14-workbench.md § 9.3): on by default (owner
    # 2026-10-24: "i always want to see it in nav"); off hides it from the nav and its API answers
    # 404; `workbench_model` off keeps the live views and disables the composer;
    # `workbench_commands` off pauses the command cards.
    workbench: bool = True
    workbench_model: bool = True
    workbench_commands: bool = True
    # Spec 043 D-6 (owner 2026-10-22, R-94 (8)): the environments where commands may run, a comma
    # list; the chat service checks the same setting (`MUDPUPPY_WORKBENCH_COMMAND_ENVS`).
    workbench_command_envs: str = "local-dev,sandbox"
    # The React console's build (R-96, spec 050), served at /app/.
    web_dist: Path = Field(default_factory=lambda: find_data_dir().parent / "apps" / "web" / "dist")
    # Persona YAML files, read to list the `ref:NAME` credentials a persona needs (spec 010 T020).
    personas_dir: Path = Field(default_factory=lambda: find_data_dir().parent / "personas")
    # Portal configs (`<id>/portal.yaml`), listed on the Portals page (spec 011).
    portals_dir: Path = Field(default_factory=lambda: find_data_dir().parent / "portals")
    # Glossary, its long pages and the BA wiki (spec 006): authored content, read-only here.
    docs_dir: Path = Field(default_factory=lambda: find_data_dir().parent / "docs")
    # Where `pnpm eval` leaves its workspaces (`pf-eval-<portal>-*`): `?store=eval:…` opens one
    # (spec 019 US5); None turns that off.
    eval_root: Path | None = Field(default_factory=lambda: Path(tempfile.gettempdir()))
