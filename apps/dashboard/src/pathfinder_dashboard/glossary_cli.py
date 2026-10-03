"""`uv run pathfinder-glossary [--check | --write]`: validate the glossary and its README.

--check (default) fails when the source is invalid or docs/glossary/README.md is out of date;
--write regenerates README.md. Contract: specs/006-glossary-ba-wiki/contracts/glossary-cli.md.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pathfinder_dashboard.glossary import GlossaryError, load_glossary, render_readme
from pathfinder_dashboard.settings import Settings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pathfinder-glossary", description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="validate only (default)")
    mode.add_argument("--write", action="store_true", help="regenerate docs/glossary/README.md")
    parser.add_argument("--docs-dir", type=Path, help="docs dir (default: the repo's docs/)")
    args = parser.parse_args(argv)

    docs_dir = args.docs_dir or Settings().docs_dir
    glossary = load_glossary(docs_dir)
    if isinstance(glossary, GlossaryError):
        for problem in glossary.problems:
            print(problem, file=sys.stderr)
        return 1

    readme = docs_dir / "glossary" / "README.md"
    text = render_readme(glossary)
    if args.write:
        readme.write_text(text, encoding="utf-8", newline="\n")
        print(f"wrote {readme} ({len(glossary.entries)} entries)")
        return 0
    current = readme.read_text(encoding="utf-8") if readme.exists() else None
    if current != text:
        print(f"{readme}: out of date; run `uv run pathfinder-glossary --write`", file=sys.stderr)
        return 1
    print(f"ok: {len(glossary.entries)} entries, {len(glossary.wiki)} wiki pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
