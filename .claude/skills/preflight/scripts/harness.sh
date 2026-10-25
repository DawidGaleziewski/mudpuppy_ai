#!/usr/bin/env bash
# Start, stop or show the MudPuppy harness: the dashboard (JSON API + console), the chat service
# (the assistant), the reference portal (practice target), and optionally the console's Vite dev
# server and the proving ground. Each service runs in its own process group, logs to
# data/logs/harness/<name>.log and is stopped by the PID recorded at start, never by name.
#
# Usage: harness.sh start  [--env <environment>] [--dev] [--proving-ground] [--no-reference]
#        harness.sh stop
#        harness.sh status
#        harness.sh logs <name>
#   --env              store and environment for the dashboard and the chat (default local-dev)
#   --dev              also the Vite dev server on 5173 (hot reload of apps/web)
#   --proving-ground   also the proving ground on 4100
#   --no-reference     skip the reference portal on 4010
set -uo pipefail

ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null) || { echo "not inside the repository" >&2; exit 2; }
cd "$ROOT" || exit 2
RUN="$ROOT/data/logs/harness"
mkdir -p "$RUN"

ENV_NAME=local-dev; DEV=0; PG=0; REF=1
cmd=${1:-status}; shift || true
while [ $# -gt 0 ]; do
  case $1 in
    --env) ENV_NAME=$2; shift 2 ;;
    --dev) DEV=1; shift ;;
    --proving-ground) PG=1; shift ;;
    --no-reference) REF=0; shift ;;
    *) [ "$cmd" = logs ] && break; echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

# name:port:health path ("" = port only)
SERVICES="dashboard:8765:/healthz chat:4310:/healthz reference-portal:4010: vite-dev:5173: proving-ground:4100:"

port_of() { tr ' ' '\n' <<<"$SERVICES" | awk -F: -v n="$1" '$1 == n { print $2 }'; }
path_of() { tr ' ' '\n' <<<"$SERVICES" | awk -F: -v n="$1" '$1 == n { print $3 }'; }
pid_of() { [ -f "$RUN/$1.pid" ] && cat "$RUN/$1.pid"; }
# The recorded pid is ours only while it still leads its own process group (setsid at start); a
# pid the system has reused for another process does not, so stop never signals a stranger.
leads_group() { [ "$(ps -o pgid= -p "$1" 2>/dev/null | tr -d ' ')" = "$1" ]; }
alive() { local p; p=$(pid_of "$1") && [ -n "$p" ] && kill -0 "$p" 2>/dev/null && leads_group "$p"; }
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
healthy() {
  local port path; port=$(port_of "$1"); path=$(path_of "$1")
  if [ -n "$path" ]; then curl -fs -o /dev/null --max-time 2 "http://127.0.0.1:$port$path"; else port_busy "$port"; fi
}

launch() { # name, command...
  local name=$1; shift
  if alive "$name"; then echo "  $name already running (pid $(pid_of "$name"))"; return; fi
  local port; port=$(port_of "$name")
  if port_busy "$port"; then echo "  $name: port $port is taken by another process; not started" >&2; return 1; fi
  # setsid: its own process group, so stop ends the service and the children it started.
  setsid bash -c 'exec "$@"' _ "$@" >"$RUN/$name.log" 2>&1 < /dev/null &
  echo $! >"$RUN/$name.pid"
  echo "  $name starting (pid $!, log data/logs/harness/$name.log)"
}

wait_healthy() { # name, seconds
  local i
  # A service this script did not start (launch refused: its port was taken) is never "up".
  alive "$1" || { echo "  $1 not started by this script" >&2; return 1; }
  for ((i = 0; i < $2; i++)); do
    alive "$1" || { echo "  $1 exited; last log lines:" >&2; tail -15 "$RUN/$1.log" >&2; return 1; }
    healthy "$1" && { echo "  $name_ok $1 up on http://127.0.0.1:$(port_of "$1")"; return 0; }
    sleep 1
  done
  echo "  $1 not healthy after $2 s; see data/logs/harness/$1.log" >&2; return 1
}
name_ok="✓"

start() {
  "$ROOT/.claude/skills/preflight/scripts/preflight.sh" --env "$ENV_NAME" >"$RUN/preflight.log" 2>&1 || {
    echo "preflight failed; fix it first:" >&2; grep -A1 FAIL "$RUN/preflight.log" >&2; exit 1
  }
  echo "Starting the harness on $ENV_NAME"
  launch dashboard bash -c "cd apps/dashboard && exec uv run mudpuppy-dashboard --env '$ENV_NAME'"
  launch chat env MUDPUPPY_ENV="$ENV_NAME" pnpm --dir apps/chat start
  [ $REF = 1 ] && launch reference-portal pnpm --dir apps/crawler reference-portal
  [ $DEV = 1 ] && launch vite-dev pnpm --dir apps/web dev
  [ $PG = 1 ] && launch proving-ground pnpm --dir apps/proving-ground start
  local bad=0
  wait_healthy dashboard 60 || bad=1
  wait_healthy chat 60 || bad=1
  [ $REF = 1 ] && { wait_healthy reference-portal 60 || bad=1; }
  [ $DEV = 1 ] && { wait_healthy vite-dev 60 || bad=1; }
  [ $PG = 1 ] && { wait_healthy proving-ground 120 || bad=1; }
  echo
  echo "Console:  http://127.0.0.1:$([ $DEV = 1 ] && echo 5173 || echo 8765)/app/"
  [ $REF = 1 ] && echo "Practice: http://127.0.0.1:4010/"
  echo "Stop:     .claude/skills/preflight/scripts/harness.sh stop"
  return $bad
}

stop() {
  local name pid any=0
  for name in vite-dev proving-ground reference-portal chat dashboard; do
    pid=$(pid_of "$name") || continue
    any=1
    if kill -0 "$pid" 2>/dev/null && leads_group "$pid"; then
      echo "  stopping $name (process group $pid)"
      kill -TERM -- "-$pid" 2>/dev/null
      for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
      kill -0 "$pid" 2>/dev/null && { echo "  $name did not stop in 10 s; killing group $pid"; kill -KILL -- "-$pid" 2>/dev/null; }
    fi
    rm -f "$RUN/$name.pid"
  done
  [ $any = 0 ] && echo "  nothing started by this script is running"
  # The chat's MCP servers and their browsers stop with it; list anything left (CLAUDE.md).
  local left
  left=$(pgrep -af "mcp-server|chrome-headless-shell" | grep -v pgrep || true)
  if [ -n "$left" ]; then
    echo "  still running, $(wc -l <<<"$left") process(es) (check before killing; servers of Claude Code sessions belong to them):"
    head -8 <<<"$left" | cut -c1-110 | sed 's/^/    /'
  fi
}

status() {
  local name state
  for name in dashboard chat reference-portal vite-dev proving-ground; do
    if alive "$name"; then
      if healthy "$name"; then state="up"; else state="starting/unhealthy"; fi
      printf '  %-17s %-18s pid %-7s http://127.0.0.1:%s\n' "$name" "$state" "$(pid_of "$name")" "$(port_of "$name")"
    elif port_busy "$(port_of "$name")"; then
      printf '  %-17s %-18s port %s taken by a process not started here\n' "$name" "foreign" "$(port_of "$name")"
    else
      printf '  %-17s %s\n' "$name" "stopped"
    fi
  done
}

case $cmd in
  start) start ;;
  stop) stop ;;
  status) status ;;
  logs) tail -n 60 -f "$RUN/${1:?usage: harness.sh logs <name>}.log" ;;
  *) sed -n 2,15p "$0"; exit 2 ;;
esac
