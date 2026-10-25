# Getting started with MudPuppy

A step-by-step path from a fresh clone to your first documentation: install, start the practice
portal, scan it, have the BA agent document it, review the result and export it. It takes about an
hour, most of it waiting for the scan.

For every page of the console in detail, read [how-to-use.md](how-to-use.md) afterwards. For an
example of what comes out at the end, see [sample-documentation/](sample-documentation/README.md),
MudPuppy's documentation of its own console.

All commands run from the repository root unless a step says otherwise.

## Step 1. Check the prerequisites

| Tool | Version | Used for |
| --- | --- | --- |
| Node.js | 22 or newer | the crawler, the console, the chat service |
| pnpm | 12 (`corepack enable` picks the version the repo pins) | JS/TS workspace |
| Python + [uv](https://docs.astral.sh/uv/) | Python 3.13, any recent uv | the dashboard (JSON API) |
| [Claude Code](https://claude.com/claude-code) | logged in on this machine | the crawler, BA and chat agents run on your Claude login |
| Linux, macOS or WSL2 | | Chromium runs headless |

```bash
node --version    # v22.x or newer
pnpm --version
uv --version
claude --version
```

## Step 2. Install

```bash
git clone <this repository> mudpuppy && cd mudpuppy
pnpm install                                                           # one workspace for every JS/TS app
pnpm --dir apps/crawler exec playwright install --with-deps chromium   # the crawler's browser
(cd apps/dashboard && uv sync)                                         # the dashboard (Python)
pnpm --dir apps/web build                                              # the console, served by the dashboard
```

Optional, if you will commit: `git config core.hooksPath .githooks` installs the pre-commit checks.

Then check the machine:

```bash
.claude/skills/preflight/scripts/preflight.sh          # every tool, install, build, the store and the ports
.claude/skills/preflight/scripts/preflight.sh --fix    # also runs the safe fixes (installs, builds)
```

Each problem comes with the command that fixes it. In Claude Code, *"run preflight"* does the same
through the `preflight` skill.

## Steps 3–4 in one command

```bash
.claude/skills/preflight/scripts/harness.sh start      # dashboard + chat + practice portal, waits until healthy
.claude/skills/preflight/scripts/harness.sh status
.claude/skills/preflight/scripts/harness.sh stop
```

Add `--dev` for the console's hot-reload server (5173) and `--proving-ground` for the obstacle
estate (4100). Logs are in `data/logs/harness/`. Steps 3 and 4 below do the same by hand, one
terminal per service.

## Step 3. Start the practice portal

MudPuppy ships a fake insurer whose full truth is written down, so you can see how close the
documentation gets. In its own terminal:

```bash
pnpm --dir apps/crawler reference-portal       # http://127.0.0.1:4010
```

Open http://127.0.0.1:4010 once to see what will be scanned. Its portal file is
`portals/reference-insurer-local/portal.yaml` (environment `local-dev`), and its personas
(guest, client, premium client, agent) are in `personas/reference-insurer-local/`.

## Step 4. Start the console and the assistant

Two more terminals:

```bash
# the console (dashboard + React app)
cd apps/dashboard && uv run mudpuppy-dashboard --env local-dev       # http://127.0.0.1:8765/app/

# the chat service that runs the assistant
MUDPUPPY_ENV=local-dev pnpm --dir apps/chat start                    # 127.0.0.1:4310
```

Open http://127.0.0.1:8765/app/ and pick **reference-insurer-local**. The header shows the
assistant as running. If it says **Assistant down**, check the second terminal and reload.

## Step 5. Scan the portal

1. Press **Ask the assistant** (or **Ctrl J**).
2. Type: *"Scan reference-insurer-local as the guest persona."*
3. Answer its one question (load images or skip them; loading is fine here).
4. Open **Scans** in the side menu and watch the scan record pages. A full scan of the practice
   portal takes 20–30 minutes.

If nothing is recorded for 5 minutes, press **Stop**, then ask *"resume the scan"*. A stopped
scan keeps everything it recorded.

**Without the console.** The same scan from a Claude Code session in the repository root (approve
the `mudpuppy` MCP server when asked; `.mcp.json` points it at `local-dev`):

> Use the crawler agent to map reference-insurer-local as guest.

## Step 6. Group screens into a process

1. Open **Processes**. After a scan the portal model proposes processes. Accept one, or ask the
   assistant: *"Make a process for getting a car insurance quote."*
2. Open the process and check its steps. Rename, split or merge until it matches how the business
   talks about it.

## Step 7. Get the as-is documentation

1. On the process, ask the assistant: *"Produce the documentation for this process."*
2. The BA agent reads the recorded evidence (it never browses) and writes records: screens,
   requirements, business rules, data items, glossary terms, assumptions and open questions. Each
   one cites its evidence and carries a confidence label.
3. Read them in **Docs**.

**Without the console**, in Claude Code:

> Use the ba agent to document reference-insurer-local from run <run id>.

The run id is on the scan's page in **Scans**.

## Step 8. Review

Open **Review**. Everything that waits for a person is here: records to confirm, assumptions to
check, changes no rule explained, and rules to confirm.

- **Confirm** what is right.
- **Reject** what is wrong, with a reason. The reason goes back to the BA agent on its next run.

Your name is your computer login. Start the dashboard with `MUDPUPPY_REVIEWER="Your Name"` in
front to sign with another name.

## Step 9. Export

From the process, choose **Documentation** → **Download the folder (zip)**. Or from the command
line:

```bash
cd apps/crawler
pnpm docs:process-export reference-insurer-local PROC-001 --env local-dev   # one process
pnpm docs:export reference-insurer-local --env local-dev                    # the whole SRS, by record kind
```

The SRS lands in `data/exports/reference-insurer-local-local-dev-srs/`: Markdown chapters with
Mermaid diagrams, a traceability matrix, `records.json` and the screenshots.

## Step 10. Score it (optional)

The practice portal comes with its answer key, so you can measure the documentation:

```bash
cd apps/crawler
pnpm docs:evaluate reference-insurer-local --env local-dev \
  --ground-truth packages/reference-portal/ground-truth.yaml
```

It scores screens, fields, constraints, rules, processes and terms, and lists every miss and
every over-claim.

## Step 11. Scan your own portal

1. In the console, choose **new portal** in the portal menu. Give a short name, the address of
   each environment (production, staging or sandbox) and how far the crawler may go: **only
   look**, or fill in and submit forms.
2. Add a persona: ask the assistant *"Create a persona for this portal."* It asks a few
   questions. A logged-in persona's password goes into the encrypted vault through a field, never
   through the chat text.
3. Scan it (step 5).

**MudPuppy has no production guard.** Every environment is treated the same: the crawler fills in
and submits forms up to the action limit you set, on production too, where that really happens on
the live site. For a site you only want to look at, choose **only look, never submit** (or tell the
assistant *"scan it, only look"*). robots.txt is respected unless you switch it off per portal,
and a CAPTCHA is handed to you, never solved. Scan only sites you are allowed to, and read their
terms first. Details: [portal-config.md](portal-config.md).

## Step 12. Stop everything

`harness.sh stop`, or **Ctrl+C** in each terminal. A scan the chat started becomes *Interrupted*
and can be resumed later. Then check that nothing was left behind:

```bash
pgrep -af "mcp-server|chrome-headless-shell"
```

## Where next

- [how-to-use.md](how-to-use.md): every console page, scans with focus, form probes, to-be
  processes, amendments and the portal model.
- [glossary/README.md](glossary/README.md): the vocabulary (run, frontier, evidence, persona…).
- [portal-config.md](portal-config.md): every field of a portal file.
- `README.md`: how the crawler and its safety model work.
