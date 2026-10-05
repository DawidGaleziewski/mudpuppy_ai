#!/usr/bin/env bash
# PreToolUse(Bash) hook: verification before `git commit` (CLAUDE.md "Verification Before Commit"),
# limited to the suites the changed paths can break. Docs-only commits run nothing.
# Exit 2 blocks the commit and shows stderr to Claude.
set -uo pipefail

cmd=$(node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).tool_input.command||'')}catch{process.stdout.write('')}})")
case "$cmd" in *"git commit"*) ;; *) exit 0 ;; esac

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

# The same Bash call often runs `git add … && git commit`, so staged files alone are not enough:
# take staged, unstaged and untracked changes.
changed=$( { git diff --cached --name-only; git diff --name-only; git ls-files --others --exclude-standard; } | sort -u)

has() { grep -Eq "$1" <<<"$changed"; }
code() { grep -Ev '\.md$' <<<"$changed" | grep -Eq "$1"; }

failed=""
run() { # name, dir, command...
  local name=$1 dir=$2; shift 2
  echo "pre-commit: $name" >&2
  (cd "$dir" && "$@") >/tmp/pre-commit-"$name".log 2>&1 || {
    failed="$failed $name"
    tail -40 /tmp/pre-commit-"$name".log >&2
  }
}

# Crawler + gates: its code, the schema, portal/persona configs, the proving-ground estate.
if code '^(apps/crawler/|data/migrations/|portals/|personas/|apps/proving-ground/)'; then
  run crawler apps/crawler bash -c 'pnpm --silent typecheck && pnpm --silent lint && pnpm --silent test'
fi
# Dashboard: its code, the schema it models, the glossary it renders.
if code '^apps/dashboard/' || has '^(data/migrations/|docs/glossary/)'; then
  run dashboard apps/dashboard bash -c 'uv run ruff check && uv run pytest -q'
fi
# Proving-ground backend.
if code '^apps/proving-ground/backend/'; then
  run proving-ground apps/proving-ground/backend bash -c 'uv run ruff check && uv run pytest -q'
fi

if [ -n "$failed" ]; then
  echo "pre-commit: failed:$failed (logs in /tmp/pre-commit-*.log)" >&2
  exit 2
fi
exit 0
