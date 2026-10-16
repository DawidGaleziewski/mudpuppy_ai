#!/usr/bin/env python3
"""PreToolUse(Bash) hook: block script edits of tracked files (CLAUDE.md "Do NOT edit files with
Python/sed text-replacement scripts"; spec 022 F-03, F-04, F-10; spec 030 F-14).

Blocks `sed -i`, `perl -i`, `>`/`>>`/`tee` writes and Python scripts that write files, whose
target is a file git tracks. Reads, new untracked files and scratch files stay allowed. Exit 2
blocks the call and shows stderr. Tests: `python3 -m unittest discover -s .claude/hooks`.
"""

import json
import os
import re
import shlex
import subprocess
import sys

IN_PLACE = re.compile(r"^(sed|perl)$")
REDIRECT = re.compile(r"^\d*>>?$")
SEPARATORS = {";", "&&", "||", "|", "&"}
# A heredoc opener: `<<EOF`, `<<-EOF`, `<<'EOF'`, `<< "EOF"`.
HEREDOC = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")
# Python that writes: open(..., 'w'|'a'|'x'), Path(...).write_text/bytes, shutil copies/moves.
PY_WRITES = re.compile(
    r"open\([^)]*['\"][wax]\+?b?['\"]|\.write_(text|bytes)\(|shutil\.(copy\w*|move)\(|os\.replace\("
)
PY_LITERAL = re.compile(r"['\"]([^'\"\s]+\.[A-Za-z0-9]+)['\"]")


def tracked(path: str) -> bool:
    result = subprocess.run(
        ["git", "ls-files", "--error-unmatch", "--", path],
        capture_output=True,
        check=False,
    )
    return result.returncode == 0


def split_heredocs(command: str) -> tuple[str, list[str]]:
    """The command without heredoc bodies (they break the lexer), and the bodies."""
    lines = command.split("\n")
    out: list[str] = []
    bodies: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        i += 1
        for m in HEREDOC.finditer(line):
            end = m.group(2)
            body: list[str] = []
            while i < len(lines) and lines[i].strip() != end:
                body.append(lines[i])
                i += 1
            i += 1  # the terminator
            bodies.append("\n".join(body))
    return "\n".join(out), bodies


def words_of(command: str) -> list[str]:
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|<>")
        lexer.whitespace_split = True
        return list(lexer)
    except ValueError:
        # Unbalanced quotes: fall back to whitespace words, so redirects are still seen.
        return re.findall(r"\d*>>?|[;&|]+|[^\s;&|<>]+", command)


def shell_targets(command: str, cwd: str) -> list[str]:
    """Files a shell command writes, resolved against the directory each part runs in."""
    words = words_of(command)
    here = cwd
    found: list[str] = []
    at = lambda p: os.path.normpath(os.path.join(here, os.path.expanduser(p)))  # noqa: E731
    for i, word in enumerate(words):
        nxt = words[i + 1] if i + 1 < len(words) else ""
        prev = words[i - 1] if i > 0 else ";"
        if word == "cd" and prev in SEPARATORS and nxt and nxt not in SEPARATORS:
            here = at(nxt)
        elif REDIRECT.match(word) and nxt and not nxt.startswith("&"):
            found.append(at(nxt))
        elif word == "tee":
            found += [at(w) for w in words[i + 1 :] if not w.startswith("-")][:1]
        elif IN_PLACE.match(word):
            rest = words[i + 1 :]
            end = next((j for j, w in enumerate(rest) if w in SEPARATORS), len(rest))
            args = rest[:end]
            if any(re.match(r"^-[a-zA-Z]*i", a) or a.startswith("--in-place") for a in args):
                found += [at(a) for a in args if not a.startswith("-")]
    return found


def python_targets(command: str, bodies: list[str], cwd: str) -> list[str]:
    """Path literals in a Python script that writes files (`python3 - <<EOF`, `python3 -c`)."""
    if not re.search(r"\bpython3?\b", command):
        return []
    scripts = [*bodies, command]
    if not any(PY_WRITES.search(s) for s in scripts):
        return []
    return [os.path.normpath(os.path.join(cwd, p)) for s in scripts for p in PY_LITERAL.findall(s)]


def targets(command: str, cwd: str = ".") -> list[str]:
    shell, bodies = split_heredocs(command)
    return shell_targets(shell, cwd) + python_targets(shell, bodies, cwd)


def main() -> int:
    try:
        data = json.load(sys.stdin)
        command = data.get("tool_input", {}).get("command", "")
        cwd = data.get("cwd") or os.getcwd()
    except (ValueError, AttributeError):
        return 0
    hits = [t for t in targets(command, cwd) if t not in {"/dev/null", "-"} and tracked(t)]
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
