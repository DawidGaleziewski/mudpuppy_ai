#!/usr/bin/env bash
# The checks before a commit (CLAUDE.md "Verification Before Commit"), limited to the suites the
# changed paths can break; docs-only changes run nothing. Run by the git pre-commit hook
# (`.githooks/pre-commit`, installed with `git config core.hooksPath .githooks`) and, where that
# hook is not installed, by Claude Code's PreToolUse hook (`.claude/hooks/pre-commit-check.sh`).
# Exit 2 blocks the commit; the failing suite's log tail goes to stderr.
set -uo pipefail

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

# Staged, unstaged and untracked changes: the same Bash call often runs `git add … && git commit`.
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
# The console (spec 076): types, ESLint (atomic layers, pages never style, size), stylelint (tokens
# only, class names), knip (no dead code), jscpd (no duplicated blocks), the tests.
if code '^apps/web/'; then
  run web apps/web bash -c 'pnpm --silent check'
fi
# Dashboard: its code, the schema it models, the glossary it renders.
if code '^apps/dashboard/' || has '^(data/migrations/|docs/glossary/)'; then
  # Perf budgets and load-sensitive tests run alone after the parallel run (spec 012 F-08, 022 F-01).
  run dashboard apps/dashboard bash -c "uv run ruff check && uv run pytest -q -n auto -m 'not perf and not serial' && uv run pytest -q -m 'perf or serial'"
fi
# The dashboard's review page shells out to the crawler's operator scripts (`docs:review`), so a
# script change can break it without a dashboard file changing (spec 030 F-15).
if code '^apps/crawler/scripts/' && ! { code '^apps/dashboard/' || has '^(data/migrations/|docs/glossary/)'; }; then
  run "dashboard (review)" apps/dashboard bash -c 'uv run pytest -q tests/test_review.py tests/test_review_inbox.py'
fi
# The hooks themselves (spec 031 T001).
if code '^(\.claude/hooks/|\.githooks/)'; then
  run hooks . python3 -m unittest discover -s .claude/hooks
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
