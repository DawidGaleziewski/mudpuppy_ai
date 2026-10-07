# How to use MudPuppy (guided chat)

A walkthrough for business analysts (BAs) and the developer who sets things up. It covers the full
path: start the tools, scan a portal, pick one process, get its as-is documentation, and write
down the changes you want (to-be amendments).

All screenshots come from a real session on the local reference portal (`reference-insurer`) in
the `sandbox` environment, taken on 2026-10-06.

## Contents

1. [What you work with](#1-what-you-work-with)
2. [One-time setup (developer)](#2-one-time-setup-developer)
3. [Start the tools](#3-start-the-tools)
4. [The chat page](#4-the-chat-page)
5. [Scan a portal](#5-scan-a-portal)
6. [Stop and resume a scan](#6-stop-and-resume-a-scan)
7. [Narrow down to one process](#7-narrow-down-to-one-process)
8. [Get the as-is documentation](#8-get-the-as-is-documentation)
9. [Write down the changes you want (amendments)](#9-write-down-the-changes-you-want-amendments)
10. [When a fresh scan changes the portal (superseded amendments)](#10-when-a-fresh-scan-changes-the-portal-superseded-amendments)
11. [When something fails (error references)](#11-when-something-fails-error-references)
12. [Hand the documentation over (export)](#12-hand-the-documentation-over-export)
13. [Stop everything](#13-stop-everything)
14. [Troubleshooting](#14-troubleshooting)

## 1. What you work with

| Piece | What it is | Address |
| --- | --- | --- |
| Dashboard | The web page you use: overview, docs, chat, glossary. It only reads the database. | http://127.0.0.1:8765 |
| Chat service | Runs the assistant behind the Chat page and records your requests. | 127.0.0.1:4310 (no page of its own) |
| Assistant (orchestrator) | Guides you through the steps. It calls the **crawler** (scans the portal) and the **BA agent** (writes the documentation). | inside the chat |
| Reference portal | A fake Polish insurer for practice. | http://127.0.0.1:4010 |

The assistant can **not** change the tool itself (agents, code, safety settings). If you ask it
to, it says that this is a developer task. Passwords never go through the chat; they go into a
form beside it.

### Choose a portal, or add a new one

At the top right, next to **data store** (which local database the dashboard reads; normally
`sandbox`), the **portal** dropdown chooses which portal you work on. It lists the configured portals and every portal that was scanned. Once chosen, the pages
follow it until you change it: **Overview** shows only its runs, **Docs** opens its
documentation, **Chat** opens its newest conversation and **[new conversation]** starts one for
it. **all portals** shows everything again.

To work on a site that is not in the list (for example wikipedia.org), choose **+ new portal**:

![New portal form](how-to-use/16-new-portal.png)

- **Short name**: proposed from the first address (`wikipedia-org`) when left empty.
- **production / staging / sandbox**: the address of each environment the site has. Fill at
  least one; leave the others empty. The crawler starts at that address and stays on its domain
  and subdomains. A public site (like wikipedia.org) is **production**.
- **The most a scan may do here**, per environment: by default up to filling in and submitting
  forms. This is a ceiling: each scan still only looks unless you allow edits when the assistant
  asks (below). Choose **only look, never submit** to rule edits out for that environment.
- **robots.txt**: **ignore it** (default) visits every page, whatever the site's robots.txt
  says; **respect it** follows it. Ignoring it, and checking the site's terms, is your
  responsibility.

**[save portal and open chat]** saves it, chooses it in the dropdown and opens a chat for it.
Ask *"scan it"*; if the portal has several environments, the assistant asks which one (or say
*"scan production"*). If the name is taken or an address is wrong, the form says why and keeps
what you typed.

Before each new scan the assistant asks two things (answer both in one line, or say them in your
request, e.g. *"scan it, you may submit forms, skip images"*):

- **Read-only, or may it fill in and submit forms?** Read-only is the default. If you allow it,
  the scan fills in and submits forms up to the environment's limit, on production too, where
  that really happens on the live site. No further warnings.
- **Load images, or skip them?** Images load by default, so you can see what each page asks for.
  Skipping them maps image-heavy sites much faster; every skipped image shows an
  **"Image skipped: images turned off for this scan"** box in the screenshot where it would be.

If an address cannot be opened (a typo, or the site is down), the scan says so instead of
recording an empty page; check the address under **[settings]**.

### Portal settings: add or revoke environments

With a portal chosen, **[settings]** next to the dropdown lists its environments: address and
how far the crawler may go.

![Portal settings](how-to-use/17-portal-settings.png)

- **Add or change an environment**: pick it, give the address and the limit, **[save
  environment]**. Picking one that is already there changes it.
- **[revoke]** removes an environment from the portal. Runs already recorded for it are kept.
  The last environment cannot be revoked.

Every scan is recorded with its environment, and all of them show in the dashboard's data, so
you do not start anything separately for production.

## 2. One-time setup (developer)

From the repo root:

```bash
pnpm install                                                     # all JS/TS apps, at the root only
pnpm --dir apps/crawler exec playwright install --with-deps chromium   # browser for the crawler
cd apps/dashboard && uv sync && cd ../..                          # dashboard (Python)
```

The assistant uses your Claude Code login, so be logged in to Claude Code on this machine.

Portals are configured as files in `portals/<portal>/portal.yaml` (see
[portal-config.md](portal-config.md)). A portal that needs a logged-in user also needs the
vault key; the first `pnpm --dir apps/crawler vault …` call creates it
(`~/.config/pathfinder/vault.key`).

## 3. Start the tools

Use three terminals (four when you practise on the reference portal), all from the repo root:

```bash
# 1. dashboard: pick the environment whose data you want to see
cd apps/dashboard && uv run pathfinder-dashboard --env sandbox
#    add PATHFINDER_REVIEWER="Your Name" in front to enable confirm/reject/comment on records

# 2. chat service (needed by the Chat page)
pnpm --dir apps/chat start                  # PATHFINDER_ENV=sandbox is the default

# 3. only for practice: the reference portal
pnpm --dir apps/crawler reference-portal    # http://127.0.0.1:4010
```

Then open http://127.0.0.1:8765. The **Overview** lists the portals and their runs; the
**portal** dropdown and the **data store** switch are at the top right.

![Overview page](how-to-use/00-overview.png)

If the Chat page says "The chat service is not running", start terminal 2 and reload.

## 4. The chat page

Open **Chat** and press **[new conversation]**. The assistant opens with what it can do and
the configured portals. It does this without calling the model, so it shows up at once.

![A new conversation](how-to-use/01-new-conversation.png)

The page has three parts:

- **The conversation** (left). Type in the box. **Enter** sends; **Shift+Enter** starts a new
  line. While the assistant works you see the MudPuppy animation and the tool it is running,
  and **[stop]** appears next to **[send]** (see section 6). Under the animation, the
  **progress** of the conversation's scan: pages found, links still queued, steps used, time,
  and an **Activity** list of what the crawler did, newest first (section 5).
- **[reset assistant]** and **[new conversation]** (top right). See "Start over" below.
- **Steps** (right, top). These are the five steps of the work: **Scan → Map → Narrow → Document → Amend**.
  Each shows `[TODO]` to do, `[PEND]` waiting to start, `[RUN.]` in progress, `[DONE]` done or
  `[FAIL]` failed. The steps come from what was actually recorded, not from what the assistant
  says, and they stay correct after a reload.
- **Map** (right, under Steps). The pages of the scan, drawn while the crawler goes (section 5).
- **Credentials** and **Process scope** (right, below). The credentials form is for test-user
  passwords. The checklist is for choosing the screens of one process.

![Credentials form and process scope checklist](how-to-use/05-side-panel.png)

### Start over: reset the assistant or open a new conversation

- **[reset assistant]** gives the assistant a fresh context in the same conversation. The
  history stays on screen, and the assistant still knows the portal and where the steps stand,
  but not the earlier messages. Use it when the assistant gets confused or the conversation is
  long. It is refused while the assistant answers: press **[stop]** first.
- **[new conversation]** starts from zero: a new conversation with its own steps. The page opens
  the newest conversation, so start a new one before you switch to another portal.

If the chat service is restarted, the assistant gets the portal, the steps and the last
messages of the conversation by itself, so you can carry on.

At any time you can ask **"what can I do?"**. The assistant then checks where the work stands and
proposes the next steps in order.

## 5. Scan a portal

A scan (map run) visits the portal as one **persona** and records every screen, link, form
and what happens behind forms (off production).

1. Name the portal: *"Scan reference-insurer as the guest persona."*
2. If no persona fits, the assistant asks a few questions, one at a time: anonymous or logged
   in, how far it may go, a short name. It then saves the persona.
3. If the persona logs in, the assistant names the credential references (for example
   `PG_BANK_LOGIN`). Type the values into the **Credentials** form beside the chat (choose the
   environment first) and press **[store credentials]**. The values go to the encrypted vault
   and are never shown again.
4. The assistant starts the crawler. The **Scan** step shows `[PEND]`, then `[RUN.] in progress`
   once the crawler's run exists.

![Scan step waiting to start](how-to-use/03-working.png)

The crawler keeps going until every queued link has been visited (it does not stop because links
"look like duplicates"). On the reference portal a full scan takes 20–30 minutes. You can keep
working elsewhere: the scan runs on, and when you come back the page shows it still working.
When the run completes, **Scan** shows `[DONE]`.

While it runs, the progress under the animation shows what is happening, read from what the
crawler recorded (so it is the same after a reload):

![Progress of a scan: counters and the activity list](how-to-use/14-progress.png)

- The first line: the run's status, the portal and a link to the run's page.
- The counters: **pages found**, links **still queued**, **steps** used of the limit, time, and
  the time of the **last activity**.
- **Activity**, newest first: *New page* (a screen seen for the first time, bold), *Clicked …
  on /a → /b* (one crawler step), *Form found*, problems in red (*Error: …*, *The page never
  settled*, *HTTP 500 …*), *Not done* (a link the crawler could not or may not follow, with the
  reason) and *Question for you* (bold). Click a line to open that screen.
- **Nothing recorded for 5 min** (in red): the crawler may be stuck. Press **[stop]**, then ask
  the assistant to resume the scan.

The **Map** beside the steps draws the pages as they are found: each page hangs off the page
the crawler came from, with the link it clicked on the arrow. Pages found in the last minute
and the page the crawler is on are highlighted. Scroll inside the map when it grows.

![Live map of a scan](how-to-use/15-live-map.png)

### Scan only part of a portal (focus)

A scan maps the whole portal unless you say otherwise. Tell the assistant which part, in your own
words, for example *"only the English site, leave out the Special: pages for now"*. It says back
in one line what the scan will and will not open, then passes a **focus** to the crawler:

- where to start (for example `https://en.wikipedia.org/`),
- which addresses it stays on (for example only `en.wikipedia.org`),
- which paths it stays within, and which it never opens (`*` matches anything, for example
  `/wiki/Special:*`).

A focus only narrows what the portal allows; asking for an address outside the portal is refused
with a plain message. It applies to this scan only (a resume keeps it); the next scan maps the
whole portal again unless you focus it too. Links outside the focus show under *Not done* with
the reason. No persona is needed for this.

A portal that was scanned before can get a new scan at any time. When a scan is stopped and you
ask for a scan, the assistant asks once: resume the stopped one, or start a new one? A new one
starts from its start page; the stopped run keeps what it recorded.

### Map one process directly

To record just one thing a visitor does, say it: *"map searching for a pickle on English
Wikipedia"*. The assistant starts a **process trace**: the crawler walks that one process
toward its goal (here: the search results are shown) instead of mapping everything. It asks the
same two questions as for a scan (read-only is enough for searching) and takes a focus too. The
**Map a process** step shows its progress. A stopped trace is started again, not resumed.

The run's own page (Overview → the run) shows what it recorded, its status, and the trace of
every step it took:

![Run page](how-to-use/13-run-page.png)

## 6. Stop and resume a scan

There are two stop buttons:

- **[stop]** next to **[send]**: stops everything this conversation started: the assistant's
  current answer and any scan that is running. Use it when the assistant is stuck or busy with
  the wrong thing. The chat says what was stopped; send a message to continue.
- **[stop scan]** on the scan's step: stops only the scan.

While a scan runs, its step shows **[stop scan]**:

![Scan in progress with the Stop scan button](how-to-use/04-scan-in-progress.png)

Press it and confirm. The step becomes **[STOP] stopped** (not failed, no error reference):
everything it recorded so far is kept, the crawler stops at its next step, and the chat says so.
You can also type *"stop the scan"*; **[stop]** next to **[send]** has the same effect on the
scan.

| Before | After |
| --- | --- |
| ![Tracker with Stop scan](how-to-use/04-tracker-stop-scan.png) | ![Tracker after stopping](how-to-use/05-tracker-stopped.png) |

To continue, press **[resume scan]** on the stopped step (or ask *"resume the scan"*). The
crawler picks up the pages still queued with the same choices (read-only or not, images or
not); it does not repeat what it already recorded. The screenshots above show the older
"interrupted" look. The assistant is told about your stop, so it knows which scan
you mean.

![The assistant after a stop](how-to-use/06-after-stop.png)

If the crawler ends before it has visited every queued link, its run is stopped the same way
and the **Scan** step fails with a reference. Ask the assistant to resume it.

## 7. Narrow down to one process

After a scan you document **one process** at a time (for example "compare products").

1. Tell the assistant which process you mean: *"I want to document the product comparison."*
   It proposes candidates from what was recorded and never invents one. If nothing matches, it
   offers to trace the process (a separate run that follows one process step by step).
2. In **Process scope** beside the chat: give the process a name, choose the persona, tick
   the screens that belong to it, mark the **start** and **end** screen, and add a note to any
   screen if you want.
3. Press **[save scope]**. The **Narrow** step becomes `[DONE]`, and the chat confirms the scope.

## 8. Get the as-is documentation

Ask: *"Produce the documentation for this process."* The assistant starts the BA agent on your
scope. **Document** shows `[RUN.]` while it writes and `[DONE]` when it finishes. The records
cite only screens inside the scope.

Read the result in **Docs** → the portal. Records are grouped by kind: screens, requirements,
business rules, data items, glossary, open questions. Each cites the screens and screen regions
it comes from.

![Docs tab](how-to-use/10-docs.png)

With `PATHFINDER_REVIEWER` set when the dashboard started, each record has **confirm**,
**reject** (a reason is required) and **comment**. A rejection goes back to the BA agent the next
time it runs.

## 9. Write down the changes you want (amendments)

Amendments are **to-be** notes: what the business wants changed. They are kept apart from what
was observed and from the as-is documentation.

1. Open a screen: Overview → run → a state, or from a record's evidence link.
2. Scroll to **Amendments `TO-BE`** at the bottom of the screen page.
3. Under **Applies to**, choose the whole screen or one element (from the wireframe). Write
   the **Note** (what should be different, and why). Optionally attach a file of up to 8 MB.
4. Press **[add amendment]**. It gets a key such as `AMD-001`. You can withdraw it later.

![Screen page with the amendment form](how-to-use/09-state-page.png)

## 10. When a fresh scan changes the portal (superseded amendments)

After a scan you started from the chat finishes, MudPuppy checks your active amendments against
what that scan saw. When the screen or element an amendment points at has changed or disappeared,
the amendment becomes **superseded**. It is kept with the reason, the run and the time, and the
chat tells you. Open **[amendments to review]** under the steps to see them:

![Superseded amendments](how-to-use/11-superseded.png)

For each one choose **re-apply** (pick the current screen or element it now belongs to; a new
active copy is made) or **dismiss**. Superseded and dismissed amendments are not in the to-be
chapter of the export; they are listed in its appendix.

## 11. When something fails (error references)

When something goes wrong, the chat and the step show a reference like
`ERR-01M480P5EMJSW94233H14WHWZ4` with a **[copy]** button. Ask the assistant what to do next, or
give the reference to a developer. A developer opens it in the dashboard at
`/chat/errors/<reference>` (or follows the link) to see where it happened and the details. The
details never contain passwords.

![Error lookup](how-to-use/12-error-lookup.png)

The log lines are in `data/logs/chat/<date>.jsonl` and are kept for 30 days.

## 12. Hand the documentation over (export)

From `apps/crawler`:

```bash
pnpm docs:export reference-insurer --env sandbox                     # everything
pnpm docs:export reference-insurer --env sandbox --confirmed-only    # only confirmed records
pnpm docs:export reference-insurer --env sandbox --scope <process scope id>   # one process
```

It writes Markdown chapters with diagrams, a traceability matrix, `records.json` and the images
to `data/exports/<portal>-<env>-srs/`. Active amendments are in a separate to-be chapter.

## 13. Stop everything

Press **Ctrl+C** in each terminal. A scan the chat started ends with it and becomes
*interrupted*, so it can be resumed later. The chat's `pathfinder` servers stop with the chat
service, however it is stopped (Ctrl+C or `kill`): each one closes its browser, marks its own
running scan *interrupted* and exits. If the computer crashed or a process was killed hard, you
can check that nothing was left behind:

```bash
pgrep -af "mcp-server|chrome-headless-shell"
```

A leftover `pathfinder` server from the chat (its parent is gone) can be stopped with
`kill <pid>`; it marks only its own runs interrupted. Servers started by other Claude Code
sessions belong to those sessions; leave them alone.

## 14. Troubleshooting

| You see | What to do |
| --- | --- |
| "The chat service is not running" | Start `pnpm --dir apps/chat start`, reload the page. |
| "The assistant has used up its Claude usage limit. It resets …" | The Claude account behind the chat is out of usage. Wait until the time shown, then send your message again. |
| "No activity for 5 min" or "Nothing recorded for …" | The assistant or the crawler may be stuck. Press **[stop]**, then ask to resume the scan. |
| The assistant seems confused or mixes up earlier messages | Press **[reset assistant]**: fresh context, same portal and steps. |
| Scan stays `[PEND]` / `[RUN.]` with no run for 10 minutes | It fails with an error reference; read the assistant's last message (often a safety refusal or missing compliance data in the portal file). |
| Scan `[FAIL]` and the chat says the run was stopped | The crawler ended before the queue was empty. Ask the assistant to resume the scan. |
| "test-user credentials are missing" | Fill the **Credentials** form beside the chat for that environment. |
| `ROBOTS_UNAVAILABLE` or another refusal in capitals | A safety gate refused. The assistant quotes it word for word; a developer fixes the portal configuration. |
| `sh: tsx: not found` when starting the reference portal | Start it with `pnpm --dir apps/crawler reference-portal` (not from its own folder), after `pnpm install` at the root. |

More terms are explained in the dashboard's **Glossary** tab and in
[glossary/README.md](glossary/README.md).
