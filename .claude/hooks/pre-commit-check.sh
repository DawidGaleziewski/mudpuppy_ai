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
  local log=/tmp/pre-commit-${name%% *}.log # first word: "crawler (fast tier)" → crawler
  echo "pre-commit: $name" >&2
  (cd "$dir" && "$@") >"$log" 2>&1 || {
    failed="$failed ${name%% *}"
    tail -40 "$log" >&2
  }
}

# Crawler: its code, the schema, portal/persona configs, the proving-ground estate. Fast tier only
# (affected tests, no browser end-to-end files, no gates); `pnpm test:slow` and `pnpm test` are
# run by hand per CLAUDE.md (spec 012 US1).
if code '^(apps/crawler/|data/migrations/|portals/|personas/|apps/proving-ground/)'; then
  run "crawler (fast tier)" apps/crawler bash -c 'pnpm --silent typecheck && pnpm --silent lint && pnpm --silent test:fast'
fi
# Dashboard: its code, the schema it models, the glossary it renders.
if code '^apps/dashboard/' || has '^(data/migrations/|docs/glossary/)'; then
  # Perf budgets and load-sensitive tests run alone after the parallel run (spec 012 F-08, 022 F-01).
  run dashboard apps/dashboard bash -c "uv run ruff check && uv run pytest -q -n auto -m 'not perf and not serial' && uv run pytest -q -m 'perf or serial'"
fi
# Chat service and the shared workflow package (R-30); chat also depends on workflow, core and
# the packages split out of core (spec 012: store, trace, docs-model, chat-model).
if code '^(apps/chat/|packages/workflow/|apps/crawler/packages/(core|store|trace|docs-model|chat-model)/)'; then
  run chat apps/chat bash -c 'pnpm --silent typecheck && pnpm --silent lint && pnpm --silent test'
fi
if code '^packages/workflow/'; then
  run workflow packages/workflow bash -c 'pnpm --silent typecheck && pnpm --silent lint && pnpm --silent test'
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
