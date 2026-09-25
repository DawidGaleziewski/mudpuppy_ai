"""Runtime settings. The dashboard binds to the local machine only (FR-012)."""

from __future__ import annotations

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
    page_size: int = 50
    # Ends each event stream after this many seconds; None in normal use (tests set it).
    sse_max_s: float | None = None
