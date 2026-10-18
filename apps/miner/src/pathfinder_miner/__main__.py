"""`pathfinder-miner`: the analysis worker's CLI (spec 039 design § 11.2).

Subcommands print JSON for `pnpm model:import`; nothing here writes the store.
- `check`: the libraries the worker needs and their versions (the reconciler calls it to decide
  whether step 10 can run).
- `rules`, `communities`: decision mining (M4, T061) and Leiden (M5, T072); not built yet.
"""

from __future__ import annotations

import argparse
import json
import sys
from importlib.metadata import PackageNotFoundError, version

REQUIRED = ("scikit-learn", "igraph", "leidenalg")
NOT_BUILT = {"rules": "M4 (T061)", "communities": "M5 (T072)"}


def libraries() -> dict[str, str | None]:
    found: dict[str, str | None] = {}
    for name in REQUIRED:
        try:
            found[name] = version(name)
        except PackageNotFoundError:
            found[name] = None
    return found


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pathfinder-miner")
    parser.add_argument("command", choices=["check", *NOT_BUILT])
    args = parser.parse_args(argv)
    if args.command == "check":
        libs = libraries()
        ok = all(libs.values())
        print(json.dumps({"ok": ok, "libraries": libs}))
        return 0 if ok else 1
    print(json.dumps({"ok": False, "error": f"{args.command} lands in {NOT_BUILT[args.command]}"}))
    return 2


if __name__ == "__main__":
    sys.exit(main())
