# MudPuppy architecture

MudPuppy is an **agent harness** that maps legacy web portals and turns what it saw into **as-is
documentation**: good enough to re-create the portal from the documentation alone
(`.specify/memory/constitution.md`, preamble). Two LLM agents do the open-ended work; everything
that must be safe, repeatable or true is deterministic code around them.

- The **crawler** agent walks a portal in a real browser and records evidence: states, transitions,
  forms, network shapes, screenshots, wireframes.
- The **BA** (business analyst) agent never browses. It reads the recorded evidence and writes keyed,
  evidence-linked documentation records (an SRS).
- Since 2.0 every scan is reconciled into one **portal model** (screens, actions, links, rules,
  processes) that lives over time (`specs/039-mudpuppy-2-portal-model/design.md`).
- People review, decide and export through the **console** (a React app) and a chat assistant.

Further reading in this folder:

| Document | What it covers |
| --- | --- |
| [harness.md](harness.md) | How the agent harness works: tools, safety, evidence, the portal model, the chat orchestrator, evals and gates |
| [data-model.md](data-model.md) | The SQLite schema by area, conventions, evidence store, config files, exports |
| [workflow.md](workflow.md) | Spec-driven development, guidelines, commit hook, test tiers |
| [../adr/README.md](../adr/README.md) | Architecture decision records |
| [../getting-started.md](../getting-started.md) | Install, scan the practice portal, document and export it |
| [../glossary/README.md](../glossary/README.md) | The project vocabulary (run, frontier, evidence, settled, ...) |

## System context

```mermaid
C4Context
  title MudPuppy system context
  Person(ba, "Business analyst", "Asks for scans, reviews findings and documentation, draws the to-be")
  Person(dev, "Developer / operator", "Runs agents from Claude Code, runs evals and operator scripts")
  System(mp, "MudPuppy", "Agent harness: maps a portal, records evidence, keeps a portal model, writes as-is documentation")
  System_Ext(portal, "Target web portal", "Legacy portal under study: reference-insurer, the proving ground, or a real site")
  System_Ext(claude, "Claude (Claude Code login)", "Runs the crawler, BA and orchestrator agents")
  Rel(ba, mp, "Uses the console and its assistant", "HTTP, browser")
  Rel(dev, mp, "Claude Code subagents, pnpm scripts")
  Rel(mp, portal, "Browses through Playwright Chromium, gated and rate-limited", "HTTPS")
  Rel(mp, claude, "Agent sessions (Claude Code, ACP adapter)")
```

There is no crawler CLI: a developer asks a Claude Code session to "use the crawler subagent to map
`<portal>` as `<persona>`" (`README.md` "Running it"), or a BA uses the console's assistant, which
starts the same subagents (`apps/chat`).

## Containers

```mermaid
C4Container
  title MudPuppy containers
  Person(ba, "Business analyst")
  System_Ext(portal, "Target portal")

  Container_Boundary(ui, "Console") {
    Container(web, "React console", "React 19, Vite, RTK Query", "apps/web: the only UI, served at /app/")
    Container(dash, "Dashboard JSON API", "Python, FastAPI, uv", "apps/dashboard: read models over the store, chat relay, evidence files")
  }
  Container_Boundary(agents, "Agents") {
    Container(chat, "Chat service", "TypeScript, ACP client", "apps/chat: orchestrator per conversation, HTTP + SSE on 127.0.0.1:4310")
    Container(crawler, "crawler subagent", "Claude, .claude/agents/crawler.md", "Proposes where to go")
    Container(baag, "ba subagent", "Claude, .claude/agents/ba.md", "Writes documentation records")
  }
  Container_Boundary(servers, "MCP servers (apps/crawler/packages/mcp-server)") {
    Container(mcp, "mudpuppy", "stdio MCP", "12 crawler tools; owns the browser")
    Container(mcpba, "mudpuppy-ba", "stdio MCP", "23 BA tools; evidence reads, record writes")
    Container(mcpchat, "mudpuppy-chat", "stdio MCP", "apps/chat/src/mcp-chat.ts: orchestrator tools")
  }
  ContainerDb(store, "Store", "SQLite (WAL), data/db/<env>.sqlite", "Layers A, M, B, chat")
  ContainerDb(evid, "Evidence store", "Filesystem, data/evidence/<sha256>.<ext>", "Snapshots, screenshots, layouts, wireframes")
  Container(miner, "Miner", "Python, scikit-learn, Leiden", "apps/miner: decision rules, process communities; read-only")

  Rel(ba, web, "Uses")
  Rel(web, dash, "/api, /chat relay, WebSocket", "JSON")
  Rel(dash, store, "Reads", "mode=ro")
  Rel(dash, chat, "Relays writes and event streams", "HTTP + SSE")
  Rel(chat, crawler, "Agent tool")
  Rel(chat, baag, "Agent tool")
  Rel(crawler, mcp, "MCP tools")
  Rel(baag, mcpba, "MCP tools")
  Rel(chat, mcpchat, "MCP tools")
  Rel(mcp, portal, "Playwright Chromium")
  Rel(mcp, store, "Writes")
  Rel(mcp, evid, "Writes")
  Rel(mcpba, store, "Reads / writes Layer B")
  Rel(chat, store, "Writes chat, process, amendment rows")
  Rel(mcp, miner, "Runs after a run's rebuild (uv)")
```

| Container | Where | Tech | Role |
| --- | --- | --- | --- |
| Claude Code subagents | `.claude/agents/*.md` | Markdown agent definitions | `crawler` (sonnet, only `mcp__mudpuppy__*` tools), `ba` (opus, only `mcp__mudpuppy-ba__*` tools + `Read` of its skill references, guarded by `.claude/hooks/ba-guard.py`). Development agents: `code-reviewer`, `db-admin`, `frontend-dev`, `governor`, `po` |
| Orchestrator prompts | `apps/chat/agents/` | Markdown | `orchestrator.md` (console chat), `workbench.md`, `workbench-live.md`. Loaded by `apps/chat/src/session-config.ts`, not Claude Code subagents |
| MCP servers | `apps/crawler/packages/mcp-server` (`src/main.ts`, `src/ba-main.ts`) | TypeScript, `@modelcontextprotocol/sdk` | `mudpuppy` (crawler tools, owns Chromium, DB, evidence) and `mudpuppy-ba` (BA tools). Registered for Claude Code in `.mcp.json` with `MUDPUPPY_ENV=local-dev` |
| Crawler packages | `apps/crawler/packages/*` | TypeScript, pnpm workspace | The deterministic core: config, safety, fingerprint, crawler runtime, store, model, docs, ... (see [Layers](#crawler-packages-and-layers)) |
| Operator scripts | `apps/crawler/scripts/*.ts` | `pnpm <script>` in `apps/crawler` | `docs:*`, `portal:*`, `model:*`, `vault`, `eval*`, `store:reset`, ... (`apps/crawler/CLAUDE.md`) |
| Chat service | `apps/chat` | TypeScript, ACP (`@agentclientprotocol/claude-agent-acp`) | One orchestrator ACP session per conversation with its own MCP servers; HTTP + SSE on 127.0.0.1:4310; the only writer of chat, process and amendment rows |
| Dashboard JSON API | `apps/dashboard` | Python 3, FastAPI, Pydantic, uv | Read models over the store (`queries_app_*.py`), one router per console page (`web/api_*.py`), chat relay (`web/chat_relay.py`), evidence files, serves `apps/web/dist` at `/app/`. Opens the store read-only |
| React console | `apps/web` | React 19, React Router 7, RTK Query, React Hook Form, Vite, Storybook | Salvage Yard design system in `src/design-system/`, pages in `src/pages/`; dev server on 5173 proxies `/api` to 8765 |
| Miner | `apps/miner` | Python, uv, scikit-learn, Leiden | `rules`, `communities`, `classify`; prints JSON that `model:mine`, `model:propose`, `model:classify` validate with Zod and write. Opens the store `mode=ro` |
| Shared packages | `packages/workflow`, `packages/workbench-contract` | TypeScript | `workflow`: pure workflow-step statuses and amendment impact (used by `apps/chat`). `workbench-contract`: what the Workbench assistant may return, and the checker |
| Reference portal | `apps/crawler/packages/reference-portal` | TypeScript HTTP server | Portal `reference-insurer` on 127.0.0.1:4010, a fake Polish insurer with `ground-truth.yaml` and switchable 2.0 scenarios (`src/scenarios.ts`) |
| Proving ground | `apps/proving-ground` | Django backend (no ORM), Vite/React micro-frontends | A fictional legacy estate (shop, bank, insurer, old pages) reproducing `docs/legacy-obstacles.md`; 4100/4101, gates use 4200/4201; ground truth in `ground-truth/*.yaml`; its own pnpm workspace |
| Scar-maker | `apps/scar-maker` | TypeScript HTTP server | One route per real-world obstacle ("scar", `scars.yaml`) on 127.0.0.1 and 127.0.0.2; gates use port 4400 |
| Evals | `apps/crawler/evals`, `apps/chat/evals` | TypeScript | Tier-2 trials with real agents, graded against ground truth (`pnpm eval`), results in `data/evals/` |
| Gates | `apps/crawler/packages/gates` | Vitest | Tier-1 quality gates against the proving ground and scar-maker; report in `data/gates/report.json` |
| Data | `data/` | SQLite + files | `migrations/` and `schema/` tracked; `db/`, `evidence/`, `exports/`, `traces/`, `logs/` generated (`data/README.md`) |
| Config | `portals/`, `personas/` | YAML, validated by `@mudpuppy/config` | Where to crawl and who acts ([data-model.md](data-model.md#configuration-files)) |

## A scan, end to end

The path of one map scan started from the console's assistant. The same crawler subagent and
`mudpuppy` server run when a developer asks Claude Code directly (then `.mcp.json` starts the
servers).

```mermaid
sequenceDiagram
  autonumber
  actor BA as Business analyst
  participant Web as React console (apps/web)
  participant Dash as Dashboard API (apps/dashboard)
  participant Chat as Chat service (apps/chat)
  participant Orc as Orchestrator session (ACP)
  participant Crw as crawler subagent
  participant MCP as mudpuppy MCP server
  participant Br as Chromium (Playwright)
  participant DB as SQLite store + evidence
  BA->>Web: "Scan reference-insurer as guest"
  Web->>Dash: POST /chat/conversations/{id}/messages
  Dash->>Chat: relay (web/chat_relay.py)
  Chat->>Orc: prompt (session-config.ts: crawler, ba, 3 MCP servers)
  Orc->>Chat: request_scan (mudpuppy-chat): checks config, writes workflow step "pending", returns brief
  Orc->>Crw: Agent tool, subagent "crawler", brief from scan-prompts.ts
  Crw->>MCP: start_run(portal, persona)
  MCP->>DB: runs row, robots policy, config snapshot
  loop until the frontier is empty
    Crw->>MCP: navigate / act(action_id, rationale)
    MCP->>MCP: re-classify + gate (scope, robots, denylist, ceiling, budget)
    MCP->>Br: execute, settle, observe frames
    Br-->>MCP: ARIA snapshot, network, screenshot
    MCP->>DB: state, transition, observation, forms, network shapes, evidence files, decisions, trace spans
    MCP-->>Crw: page summary + next frontier item
  end
  Crw->>MCP: finish_run
  MCP->>DB: complete run, reconcile portal model, mine rules, planner marks
  Chat->>DB: step recorder moves the workflow step on (every 2 s and on events)
  Chat-->>Dash: SSE events (tool_started, step_changed, ...)
  Dash-->>Web: event stream passed through
  Web->>Dash: GET /api/... (read models over the store, mode=ro)
  Dash->>DB: read
```

Sources: `apps/chat/src/scan.ts`, `scan-prompts.ts`, `session-config.ts`, `step-recorder.ts`;
`apps/crawler/packages/mcp-server/src/runtime/pipeline/process-page.ts`, `services/complete-run.ts`;
`apps/dashboard/src/mudpuppy_dashboard/web/chat_relay.py`.

## Crawler packages and layers

All TypeScript workspace packages belong to one layer of `apps/crawler/layers.json`; imports only go
downward or within a layer, and the kernel depends on no workspace package. `apps/crawler/tests/layers.test.ts`
enforces it for the crawler packages, `apps/chat` and `packages/*` (guidelines G-07, G-08).

```mermaid
flowchart TB
  subgraph servers["servers"]
    mcpserver["mcp-server"]
    chat["chat (apps/chat)"]
    gates["gates"]
    refportal["reference-portal"]
  end
  subgraph features["features"]
    crawler["crawler"]
    docs["docs"]
    doctor["doctor"]
    fixplugins["fix-plugins"]
    hooks["hooks"]
    probes["probes"]
    vault["vault"]
    wireframe["wireframe"]
    workflow["workflow (packages/)"]
  end
  subgraph store["store"]
    storepkg["store"]
  end
  subgraph models["models"]
    config["config"]
    safety["safety"]
    trace["trace"]
    docsmodel["docs-model"]
    chatmodel["chat-model"]
    model["model"]
    wbc["workbench-contract (packages/)"]
  end
  subgraph kernel["kernel"]
    core["core"]
    fingerprint["fingerprint"]
    obstacles["obstacles"]
  end
  servers --> features --> store --> models --> kernel
```

| Package | Layer | What it holds (from its `CLAUDE.md`) |
| --- | --- | --- |
| `core` | kernel | The crawl model's Zod schemas (`src/schemas/`), ids (UUIDv7), PII scrubber, content-addressed evidence store, element keys, layout, secrets redactor, pino logger |
| `fingerprint` | kernel | Pure state fingerprinting: route templates, ARIA canonicalisation, two-level fingerprint |
| `obstacles` | kernel | Dismisses cookie banners, pop-ups, chat widgets (Playwright `addLocatorHandler` + `sweep()`) |
| `config` | models | Loads and validates `portal.yaml` and persona YAML with Zod, resolves `extends`, computes the effective config |
| `safety` | models | Pure action classifier, rule set, robots.txt parser, scope checks, URL lists, denylist, block detector |
| `trace` | models | Zod schemas of trace boots, spans and imported agent turns; scrubbing and payload limits |
| `docs-model` | models | Zod schemas of everything the BA records, and of traced processes and steps |
| `chat-model` | models | Zod schemas of conversations, messages, workflow steps, process scopes, amendments, BA processes, Workbench |
| `model` | models | The 2.0 portal model as pure functions: reconcile, deviations, rules R1–R8, decision tables, planner |
| `workbench-contract` | models | The Workbench view/command contract and the view checker |
| `store` | store | SQLite through Kysely (`db-types*.ts` mirror the schema), migration runner, decision log, tracer, portal export/delete, model writer |
| `crawler` | features | Browser runtime library: action/request gates, rate limiter, robots registry, stabilizer, network recorder, ARIA observer, screenshot capture, autofill, action extractor, frontier |
| `docs` | features | Layer B core: record keys, status engine, relations, evidence resolution, audit, review, SRS rendering and export, process export, evaluation against ground truth |
| `doctor` | features | First-start diagnosis of the machine and the way to the portal (`pnpm portal:doctor`) |
| `fix-plugins` | features | Tested fixes for portal-specific scars, turned into portal hooks |
| `hooks` | features | Per-portal hooks (`portals/<id>/hooks.ts`), time-boxed, recorded, never stop the crawl |
| `probes` | features | Form probe catalogue and the deterministic outcome classifier |
| `vault` | features | Encrypted test-user credentials (AES-256-GCM) resolved from `ref:` names; `pnpm vault` |
| `wireframe` | features | Deterministic SVG + `.excalidraw` wireframes from ARIA snapshots |
| `workflow` | features | Pure workflow step statuses, next moves and amendment impact |
| `mcp-server` | servers | The `mudpuppy` and `mudpuppy-ba` servers; `src/runtime/pipeline/` is the crawl pipeline; replay driver |
| `chat` | servers | `apps/chat` (see above) |
| `gates` | servers | Tier-1 gate cases and tier-2 eval result types and comparison |
| `reference-portal` | servers | The `reference-insurer` portal and its ground truth |

File maps: `apps/crawler/packages/mcp-server/LAYOUT.md`, `apps/crawler/packages/store/LAYOUT.md`,
`apps/chat/LAYOUT.md`, `apps/dashboard/LAYOUT.md`, `apps/web/LAYOUT.md` (guideline G-30: every
package keeps a short `CLAUDE.md`, larger ones a `LAYOUT.md`).

## Three data layers

The constitution (Technical Constraints, "Data model") splits the store into three layers; chat and
Workbench rows sit beside them.

```mermaid
flowchart LR
  A["Layer A: evidence<br/>runs, states, transitions, observations,<br/>forms, network shapes, frontier, decisions<br/>(append-only, written by mudpuppy)"]
  M["Layer M: portal model<br/>model versions, screens, action classes,<br/>model transitions, build epochs<br/>(rebuilt by the reconciler)"]
  I["Interpretation<br/>deviations, hypotheses (R1–R8, mined rules),<br/>process instances"]
  B["Layer B: documentation<br/>records, revisions, evidence links,<br/>relations, reviews (written by mudpuppy-ba)"]
  C["Chat and processes<br/>conversations, workflow steps, BA processes,<br/>amendments, proposals (written by apps/chat)"]
  A --> M --> I
  A -. evidence of .-> B
  M -. documented by .-> B
  I -. cited by .-> B
  C -. scopes, to-be .-> B
```

Details: [data-model.md](data-model.md).

## Ports and processes

| Port | What | Source |
| --- | --- | --- |
| 8765 | Dashboard API + console at `/app/` | `CLAUDE.md`, `apps/dashboard/CLAUDE.md` |
| 5173 | Vite dev server of the console | `apps/web/CLAUDE.md` |
| 6006 | Storybook | `apps/web/CLAUDE.md` |
| 4310 | Chat service (127.0.0.1 only) | `apps/chat/README.md` |
| 4010 | Reference portal | `README.md` |
| 4100, 4101 | Proving ground (main, widget host) | `apps/proving-ground/README.md` |
| 4200, 4201 | Proving ground started by the gates | `apps/crawler/packages/gates/CLAUDE.md` |
| 4300 / 4400 | Scar-maker (manual / gates), on 127.0.0.1 and 127.0.0.2 | `apps/scar-maker/CLAUDE.md` |

`MUDPUPPY_ENV` selects the store `data/db/<env>.sqlite` for the MCP servers and the chat service; it
has no default in the servers (`boot-environment.ts`). `local-dev` is the local test store that
`.mcp.json` and the `portals/*-local` copies use; `sandbox` serves the original local portals, the
gates and the tests (`CLAUDE.md`).
