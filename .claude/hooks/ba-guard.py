#!/usr/bin/env python3
"""PreToolUse guard for the `ba` agent: `Read` only the ba-practice reference files.

The BA reaches recorded evidence and the store only through the pathfinder-ba MCP server
(constitution: agents access the DB only through MCP); it must not open data/ or other files.
"""
import json, os, sys

call = json.load(sys.stdin)
if call.get("tool_name") == "Read":
    root = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
    allowed = os.path.realpath(os.path.join(root, ".claude/skills/ba-practice/references"))
    target = os.path.realpath(os.path.join(root, call.get("tool_input", {}).get("file_path", "")))
    if os.path.commonpath([allowed, target]) != allowed:
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": "ba may only Read .claude/skills/ba-practice/references/*; use the pathfinder-ba tools for evidence"}}))
sys.exit(0)
