#!/usr/bin/env python3
"""PreToolUse(Bash) hook: block script edits of tracked files (CLAUDE.md "Do NOT edit files with
Python/sed text-replacement scripts"; spec 022 F-03, F-04, F-10).

Blocks `sed -i`, `perl -i` and `>`/`>>`/`tee` writes whose target is a file git tracks. Reads,
new untracked files and scratch files stay allowed. Exit 2 blocks the call and shows stderr.
"""

import json
import re
import shlex
import subprocess
import sys

IN_PLACE = re.compile(r"^(sed|perl)$")
REDIRECT = re.compile(r"^\d*>>?$")


def tracked(path: str) -> bool:
    result = subprocess.run(
        ["git", "ls-files", "--error-unmatch", "--", path],
        capture_output=True,
        check=False,
    )
    return result.returncode == 0


def targets(command: str) -> list[str]:
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|<>")
        lexer.whitespace_split = True
        words = list(lexer)
    except ValueError:
        return []
    found: list[str] = []
    for i, word in enumerate(words):
        nxt = words[i + 1] if i + 1 < len(words) else ""
        if REDIRECT.match(word) and nxt and not nxt.startswith("&"):
            found.append(nxt)
        elif word == "tee":
            found += [w for w in words[i + 1 :] if not w.startswith("-")][:1]
        elif IN_PLACE.match(word):
            rest = words[i + 1 :]
            end = next((j for j, w in enumerate(rest) if w in {";", "&&", "||", "|"}), len(rest))
            args = rest[:end]
            if any(re.match(r"^-[a-zA-Z]*i", a) or a.startswith("--in-place") for a in args):
                found += [a for a in args if not a.startswith("-")]
    return found


def main() -> int:
    try:
        command = json.load(sys.stdin).get("tool_input", {}).get("command", "")
    except (ValueError, AttributeError):
        return 0
    hits = [t for t in targets(command) if t not in {"/dev/null", "-"} and tracked(t)]
    if not hits:
        return 0
    print(
        "Blocked: script edit of tracked file(s) "
        + ", ".join(sorted(set(hits)))
        + ". Use the Edit/Write tool instead (CLAUDE.md, Verification Before Commit).",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
