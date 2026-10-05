"""Estate settings read from the environment (the launcher turns its flags into these)."""

import os
from dataclasses import dataclass
from pathlib import Path

# apps/proving-ground/ (this file is backend/src/proving_ground/config.py)
ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class EstateConfig:
    port: int
    widget_port: int
    session_timeout_s: int
    cms_delay_ms: int
    seed_users: Path
    root: Path

    @property
    def widget_origin(self) -> str:
        return f"http://127.0.0.1:{self.widget_port}"


def load() -> EstateConfig:
    env = os.environ
    return EstateConfig(
        port=int(env.get("PG_PORT", "4100")),
        widget_port=int(env.get("PG_WIDGET_PORT", "4101")),
        session_timeout_s=int(env.get("PG_SESSION_TIMEOUT_S", "300")),
        cms_delay_ms=int(env.get("PG_CMS_DELAY_MS", "400")),
        seed_users=Path(
            env.get("PG_SEED_USERS", str(ROOT / "backend" / "var" / "users.local.json"))
        ),
        root=Path(env.get("PG_ROOT", str(ROOT))),
    )


CONFIG = load()


def reload() -> EstateConfig:
    """Re-read the environment (tests change it)."""
    global CONFIG
    CONFIG = load()
    return CONFIG
