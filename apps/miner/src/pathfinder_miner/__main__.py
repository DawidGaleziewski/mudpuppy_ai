"""`pathfinder-miner`: the analysis worker's CLI (spec 039 design § 11.2).

Subcommands print JSON for `pnpm model:import`; nothing here writes the store.
- `check`: the libraries the worker needs and their versions (the reconciler calls it to decide
  whether its mining step can run).
- `rules --in <table.json>`: mine one decision point's observation table into a decision table.
- `communities --in <graph.json>`: Leiden communities of the weighted screen graph.
"""

from __future__ import annotations

import argparse
import json
import sys
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

REQUIRED = ("scikit-learn", "igraph", "leidenalg")


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
    parser.add_argument("command", choices=["check", "rules", "communities"])
    parser.add_argument("--in", dest="input", type=Path, help="the JSON input file")
    args = parser.parse_args(argv)
    if args.command == "check":
        libs = libraries()
        ok = all(libs.values())
        print(json.dumps({"ok": ok, "libraries": libs}))
        return 0 if ok else 1
    if args.input is None:
        print(json.dumps({"ok": False, "error": f"{args.command} needs --in <file.json>"}))
        return 2
    data = json.loads(args.input.read_text(encoding="utf-8"))
    if args.command == "rules":
        from pathfinder_miner.rules import mine

        print(json.dumps(mine(data), ensure_ascii=False))
    else:
        from pathfinder_miner.communities import communities

        print(json.dumps(communities(data), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
