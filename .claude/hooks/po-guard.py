#!/usr/bin/env python3
"""PreToolUse guard for the `po` agent: docs-only edits, plain git Bash, no history rewrites/pushes."""
import json, re, shlex, sys

call = json.load(sys.stdin)
tool, args = call.get("tool_name"), call.get("tool_input", {})

def deny(why):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
        "permissionDecision": "deny", "permissionDecisionReason": why}}))
    sys.exit(0)

if tool in ("Edit", "Write"):
    if not re.search(r"/(specs/|\.specify/|roadmap\.md$|CHANGELOG\.md$)", args.get("file_path", "")):
        deny("po may only edit specs/, .specify/, roadmap.md and CHANGELOG.md")
elif tool == "Bash":
    cmd = args.get("command", "")
    try:
        lex = shlex.shlex(cmd, posix=True, punctuation_chars=True)
        lex.whitespace_split = True
        tokens = list(lex)
    except ValueError:
        deny("unparseable command")
    if "`" in cmd or "$(" in cmd or any(re.fullmatch(r"[;&|<>()]+", t) for t in tokens):
        deny("po may only run a single plain git command")
    if not tokens or tokens[0] != "git":
        deny("po may only run git")
    sub = next((t for t in tokens[1:] if not t.startswith("-")), "")
    if sub in ("push", "rebase", "clean", "filter-branch") or (sub == "reset" and "--hard" in tokens) \
            or any(t in ("-f", "--force", "--force-with-lease") for t in tokens):
        deny("po must not push, rebase, clean, reset --hard or force")
