---
name: preflight
description: Checks that this machine can run the MudPuppy harness (Node 22+, pnpm, uv and Python 3.13, a logged-in Claude Code, the JS and Python installs, the crawler's Chromium, the console build, the store, the vault key, .mcp.json and the ports), fixes what is safe to fix, and starts, shows or stops the harness services (dashboard, chat service, reference portal, optionally the Vite dev server and the proving ground). Use on a fresh clone, when something "doesn't start", before a demo or a scan, or when asked to "start everything", "open the harness", "is my setup ok", "preflight", "stop everything". Not for diagnosing the way to one portal (that is pnpm portal:doctor) or for a running dashboard's pages (mudpuppy-dashboard-smoke).
---

# Preflight and the harness

Two scripts next to this file, both run from anywhere inside the repo:

| Script | Does |
| --- | --- |
| `scripts/preflight.sh [--env E] [--fix]` | Checks tools, installs, builds, config and ports. Every problem comes with the command that fixes it; `--fix` runs the safe ones (pnpm install, uv sync, Playwright Chromium, the console build). Exit 1 on any FAIL. |
| `scripts/harness.sh start [--env E] [--dev] [--proving-ground] [--no-reference]` | Runs preflight, then starts the dashboard (8765), the chat service (4310) and the reference portal (4010); `--dev` adds Vite on 5173, `--proving-ground` the estate on 4100. Waits until each is healthy. |
| `scripts/harness.sh status` / `stop` / `logs <name>` | Shows each service (up, unhealthy, stopped, or its port taken by something else), stops what it started, or follows a log (`data/logs/harness/<name>.log`). |

`E` is the store and environment (default `local-dev`, the one `.mcp.json` uses).

## Procedure

1. **Check.** Run `.claude/skills/preflight/scripts/preflight.sh`. Read the FAIL lines first, then
   the warnings. Report them to the user as a short list: what is wrong and the fix command.
2. **Fix.** Rerun with `--fix` for install and build problems. Do **not** fix by yourself what
   changes the machine outside the repo or needs the user: installing Node, pnpm, uv or Claude
   Code, `claude` login (tell the user to type `! claude` and `/login`), `apt`/`--with-deps`
   needing sudo, editing `.mcp.json`. Say the command; let the user run it.
3. **Start.** `.claude/skills/preflight/scripts/harness.sh start` (add `--dev` when working on
   `apps/web`). It refuses when preflight fails and does not start a service whose port another
   process holds; say which process holds it (`ss -ltnp | grep :<port>`) and ask before stopping it.
4. **Hand over.** Give the URLs it prints (console http://127.0.0.1:8765/app/, practice portal
   http://127.0.0.1:4010/) and the stop command.
5. **Stop.** `harness.sh stop` ends only the services it started, by the process group recorded at
   start, never by name (owner rule: kill explicit PIDs). Afterwards it lists leftover `mcp-server`
   and Chromium processes. Those are usually the `mudpuppy` servers of a Claude Code session
   (including this one) or test browsers: never kill them without checking whose they are.

## Notes

- Ports 4200, 4201 and 4400 belong to the gates and the slow test tier; preflight only warns when
  they are taken.
- A chat service that is running but answers "Assistant down" in the console usually means the
  Claude Code login expired: `claude auth status`.
- The checks match the setup in `docs/getting-started.md`; when a step there changes, change the
  script with it.
