#!/usr/bin/env bash
# Preflight: is this machine ready to run the MudPuppy harness? Checks the tools, the installs,
# the builds, the store and the ports, and prints the command that fixes each problem.
#
# Usage: preflight.sh [--env <environment>] [--fix]
#   --env   the store the harness will use (default: local-dev, as .mcp.json)
#   --fix   run the safe install/build fixes it finds (pnpm install, uv sync, playwright, web build)
# Exit 0 when nothing failed (warnings allowed), 1 when a check failed.
set -uo pipefail

ENV_NAME=local-dev
FIX=0
while [ $# -gt 0 ]; do
  case $1 in
    --env) ENV_NAME=$2; shift 2 ;;
    --fix) FIX=1; shift ;;
    -h|--help) sed -n 2,9p "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null) || { echo "not inside the repository" >&2; exit 2; }
cd "$ROOT" || exit 2

fails=0; warns=0
if [ -t 1 ]; then G=$'\033[32m' Y=$'\033[33m' R=$'\033[31m' C=$'\033[36m' N=$'\033[0m'; else G='' Y='' R='' C='' N=''; fi
ok()   { printf '  %sok%s    %s\n' "$G" "$N" "$1"; }
warn() { printf '  %swarn%s  %s\n        → %s\n' "$Y" "$N" "$1" "$2"; warns=$((warns + 1)); }
fail() { printf '  %sFAIL%s  %s\n        → %s\n' "$R" "$N" "$1" "$2"; fails=$((fails + 1)); }
# fixable: name, fix command; runs the command with --fix, else reports it as a failure.
fixable() {
  if [ $FIX = 1 ]; then
    printf '  %sfix%s   %s: %s\n' "$C" "$N" "$1" "$2"
    mkdir -p data/logs/harness
    if (eval "$2") >data/logs/harness/preflight-fix.log 2>&1; then ok "$1 (fixed)"; else fail "$1" "fix failed, see data/logs/harness/preflight-fix.log"; fi
  else
    fail "$1" "$2"
  fi
}
have() { command -v "$1" >/dev/null 2>&1; }
major() { sed -E 's/[^0-9]*([0-9]+).*/\1/' <<<"$1"; }

echo "MudPuppy preflight ($ROOT, store $ENV_NAME)"

echo "Tools"
if have node; then
  v=$(node --version); [ "$(major "$v")" -ge 22 ] && ok "node $v" || fail "node $v (22 or newer needed)" "install Node.js 22+ (e.g. nvm install 22)"
else fail "node missing" "install Node.js 22+ (e.g. nvm install 22)"; fi
want=$(sed -nE 's/.*"packageManager": *"pnpm@([0-9.]+)".*/\1/p' apps/crawler/package.json)
if have pnpm; then
  v=$(pnpm --version 2>/dev/null)
  [ "$(major "$v")" = "$(major "$want")" ] && ok "pnpm $v" || warn "pnpm $v (repo pins $want)" "corepack enable && corepack prepare pnpm@$want --activate"
else fail "pnpm missing" "corepack enable (ships with Node.js), then rerun"; fi
if have uv; then ok "uv $(uv --version | cut -d' ' -f2)"; else fail "uv missing" "curl -LsSf https://astral.sh/uv/install.sh | sh"; fi
if have uv && uv python find 3.13 >/dev/null 2>&1; then ok "python 3.13 (via uv)"; else warn "python 3.13 not found by uv" "uv python install 3.13 (uv sync also does it)"; fi
if have git; then ok "git $(git --version | cut -d' ' -f3)"; else fail "git missing" "install git"; fi
if have claude; then
  if claude auth status 2>/dev/null | grep -q '"loggedIn": *true'; then ok "claude code, logged in"
  else fail "claude code is not logged in" "run: claude   (then /login)"; fi
else fail "claude code missing (the agents and the chat run on it)" "npm install -g @anthropic-ai/claude-code"; fi
have sqlite3 && ok "sqlite3 (optional)" || warn "sqlite3 CLI missing (optional, for poking at the store)" "apt install sqlite3 / brew install sqlite"

echo "Installs and builds"
if [ -d node_modules/.pnpm ] && [ node_modules/.modules.yaml -nt pnpm-lock.yaml ]; then ok "JS workspace installed"
else fixable "JS workspace not installed or older than pnpm-lock.yaml" "pnpm install"; fi
if [ -d apps/proving-ground/node_modules ]; then ok "proving ground installed (own workspace)"
else warn "proving ground not installed (only for gates and the proving ground)" "pnpm --dir apps/proving-ground install"; fi
if have uv && (cd apps/dashboard && uv sync --check >/dev/null 2>&1); then ok "dashboard venv in sync with uv.lock"
else fixable "dashboard venv missing or out of sync with uv.lock" "(cd apps/dashboard && uv sync)"; fi
pw_cache=${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}
if ls -d "$pw_cache"/chromium_headless_shell-* >/dev/null 2>&1 || ls -d "$pw_cache"/chromium-* >/dev/null 2>&1; then ok "chromium for the crawler"
else fixable "chromium for the crawler missing" "pnpm --dir apps/crawler exec playwright install --with-deps chromium"; fi
newest_src=$(find apps/web/src apps/web/index.html -type f -newer apps/web/dist/index.html 2>/dev/null | head -1)
if [ -f apps/web/dist/index.html ] && [ -z "$newest_src" ]; then ok "console built (apps/web/dist)"
else fixable "console not built or older than its sources" "pnpm --dir apps/web build"; fi

echo "Configuration"
if [ "$(git config core.hooksPath)" = ".githooks" ]; then ok "git pre-commit hook"
else warn "git pre-commit hook not installed (needed only to commit)" "git config core.hooksPath .githooks"; fi
mcp_env=$(sed -nE 's/.*"MUDPUPPY_ENV": *"([^"]+)".*/\1/p' .mcp.json | sort -u | tr '\n' ' ')
[ "${mcp_env% }" = "$ENV_NAME" ] && ok ".mcp.json servers on $ENV_NAME" || warn ".mcp.json servers on '${mcp_env% }', preflight checks '$ENV_NAME'" "use --env ${mcp_env%% *}, or change MUDPUPPY_ENV in .mcp.json"
declared=$(grep -lE "^environment: *$ENV_NAME\b|^ *- *environment: *$ENV_NAME\b" portals/*/portal.yaml 2>/dev/null | wc -l)
[ "$declared" -gt 0 ] && ok "$declared portal(s) declare $ENV_NAME" || fail "no portal declares environment $ENV_NAME" "pick another --env, or add it to a portal (docs/portal-config.md)"
if [ -f "data/db/$ENV_NAME.sqlite" ]; then ok "store data/db/$ENV_NAME.sqlite"
else warn "store data/db/$ENV_NAME.sqlite does not exist yet" "it is created by the first scan; nothing to do"; fi
vault=${MUDPUPPY_VAULT_KEY_FILE:-$HOME/.config/mudpuppy/vault.key}
[ -f "$vault" ] && ok "vault key" || warn "no vault key yet (needed only for logged-in personas)" "created by the first: pnpm --dir apps/crawler vault …"

echo "Ports (127.0.0.1)"
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
for entry in 8765:dashboard 4310:chat 4010:reference-portal 5173:vite-dev 4100:proving-ground 4200:gates 4201:gates 4400:scar-maker; do
  p=${entry%%:*}; name=${entry#*:}
  if port_busy "$p"; then
    case $name in
      gates|scar-maker) warn "$p ($name) is in use" "the slow test tier and the gates need it free; stop what holds it before pnpm test:slow" ;;
      *) warn "$p ($name) is in use" "fine if it is the harness already running (harness.sh status); else stop it" ;;
    esac
  else ok "$p ($name) free"; fi
done

echo
if [ $fails -gt 0 ]; then
  echo "preflight: $fails failed, $warns warning(s). Fix the FAIL lines (or rerun with --fix), then rerun."
  exit 1
fi
echo "preflight: ready ($warns warning(s)). Start the harness: .claude/skills/preflight/scripts/harness.sh start"
