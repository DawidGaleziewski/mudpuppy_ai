#!/usr/bin/env bash
# PreToolUse(Bash) hook: before a `git commit` Claude runs, the shared checks of
# `.githooks/checks.sh`, unless the git pre-commit hook is installed (`core.hooksPath` =
# `.githooks`): then git runs them at the commit and this does nothing, so they never run twice.
# Exit 2 blocks the commit and shows stderr to Claude.
set -uo pipefail

cmd=$(node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).tool_input.command||'')}catch{process.stdout.write('')}})")
case "$cmd" in *"git commit"*) ;; *) exit 0 ;; esac

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ "$(git -C "$root" config --get core.hooksPath)" = ".githooks" ] && exit 0
exec "$root/.githooks/checks.sh"
