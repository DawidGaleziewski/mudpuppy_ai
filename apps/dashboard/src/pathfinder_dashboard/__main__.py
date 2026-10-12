"""`uv run pathfinder-dashboard [--env E] [--port N] [--dev]` — serves on 127.0.0.1 only."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import uvicorn

PACKAGE = Path(__file__).parent


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="pathfinder-dashboard", description=__doc__)
    parser.add_argument("--env", help="environment (a data/db/<env>.sqlite file)")
    parser.add_argument("--port", type=int, help="port on 127.0.0.1 (default 8765)")
    parser.add_argument("--data-dir", type=Path, help="data dir (default: the repo's data/)")
    parser.add_argument(
        "--dev", action="store_true", help="reload server and open pages on code changes"
    )
    args = parser.parse_args(argv)

    # Settings are read in the (possibly reloaded) worker from the environment.
    if args.env:
        os.environ["PATHFINDER_DEFAULT_ENV"] = args.env
    if args.port:
        os.environ["PATHFINDER_PORT"] = str(args.port)
    if args.data_dir:
        os.environ["PATHFINDER_DATA_DIR"] = str(args.data_dir.resolve())
    if args.dev:
        os.environ["PATHFINDER_DEV"] = "1"

    from .settings import Settings

    settings = Settings()
    # The store actually opened, after the fallback to an existing one (spec 015 F-21/F-22).
    from .db import resolve_env, store_path

    env = resolve_env(settings.data_dir, None, settings.default_env)
    print(
        f"pathfinder://console on http://{settings.host}:{settings.port}  (store "
        f"{store_path(settings.data_dir, env)}, env {env}, read-only)"
    )
    uvicorn.run(
        "pathfinder_dashboard.app:create_app",
        factory=True,
        host=settings.host,  # FR-012: local machine only
        port=settings.port,
        reload=settings.dev,
        reload_dirs=[str(PACKAGE)] if settings.dev else None,
        reload_includes=["*.py", "*.html", "*.css", "*.js"] if settings.dev else None,
        # Open event streams would otherwise hold a reload or Ctrl+C until the browser leaves;
        # browsers reconnect on their own (hx-sse), so close them after a short grace period.
        timeout_graceful_shutdown=1,
        log_level="info",
    )


if __name__ == "__main__":
    main()
