# apps/dashboard — the MudPuppy console's server

A local, **read-only** server over the crawler's SQLite store (`data/db/<env>.sqlite`). It
serves the MudPuppy console, a React single-page app built from `apps/web`, at `/app/`, and the
JSON API the console reads under `/api`: every portal's scans and how they ended, the recorded
screens with their evidence, the portal model (processes, screens, map, rules, changes), Review,
the BA agent's documentation, Settings, the glossary and the Workbench. Every write the console
offers goes through the local chat service; the dashboard never writes the store.

Since R-100 (spec 071) the console is React only: the dashboard has no pages of its own, and every
older address (`/states/<id>`, `/docs/<portal>/<key>`, `/runs/<id>`, …) answers a permanent
redirect to its page under `/app/`, so evidence links, exports and bookmarks keep working.

Specs: [`003-dashboard-ui`](../../specs/003-dashboard-ui/) (R-12),
[`004-ba-documentation`](../../specs/004-ba-documentation/) (R-15),
[`006-glossary-ba-wiki`](../../specs/006-glossary-ba-wiki/) (R-22),
[`050`–`070`](../../specs/) (R-96, the React console),
[`071-r100-react-spa`](../../specs/071-r100-react-spa/) (R-100).

## Run

```bash
pnpm --dir apps/web build            # the console, into apps/web/dist
cd apps/dashboard
uv sync
uv run mudpuppy-dashboard            # http://127.0.0.1:8765/app/
uv run mudpuppy-dashboard --dev      # reloads the server on code edits (pnpm --dir apps/web dev for the UI)
uv run mudpuppy-dashboard --env scratch --port 9000 --data-dir /path/to/data
```

Settings can also come from the environment: `MUDPUPPY_DATA_DIR`, `MUDPUPPY_DEFAULT_ENV`,
`MUDPUPPY_PORT`, `MUDPUPPY_DEV`. The data dir defaults to the repo's `data/` (the nearest
ancestor holding `data/migrations`). Every `data/db/*.sqlite` file is an environment, and every
`pnpm eval` workspace a store too: the console's header switches between them (`?store=` on any
address, kept on every link and API call).

## Writes go through the chat service

Decisions (confirm, reject, a Same screen? answer, a process edit, a mark, a scan to start) are
sent to the local chat service (`pnpm --dir apps/chat start`, default `http://127.0.0.1:4310`,
override with `MUDPUPPY_CHAT_URL`), signed with the reviewer's name:

```bash
MUDPUPPY_REVIEWER="Your Name" uv run mudpuppy-dashboard --env sandbox
```

The browser never calls that service: the assistant and the Workbench reach it through the
dashboard's relay (`/chat/conversations`, its messages, the event stream `…/events` with
`Last-Event-ID`, credentials, cancel, reset). Credential values go to the service's vault and are
never shown. If the service is not running, the console says so and shows the start command.
Requests from another origin are refused.

A record's review (confirm, reject with a reason, comment) runs
`pnpm --dir <crawler_dir> docs:review --env <env>` (`MUDPUPPY_CRAWLER_DIR`, default
`apps/crawler`) with the review as JSON on stdin, so the TypeScript status engine stays the only
writer (constitution 1.4.0). To hand the documentation to another team, export it from
`apps/crawler`: `pnpm docs:export <portal> --env <env> [--confirmed-only]`.

## Screenshots and wireframes (spec 008)

Images come from `GET /evidence/<sha256>.<png|svg|excalidraw>`, which serves only those kinds by
content address (never snapshots, layouts or paths), with an immutable cache header. The dashboard
never draws a wireframe or computes element keys: it serves the files the crawler wrote and
matches cited keys against the keys stored in each layout.

## Glossary and BA wiki

The glossary source is `docs/glossary/glossary.yaml` (long pages in `docs/glossary/pages/`, BA
wiki pages in `docs/wiki/`); `MUDPUPPY_DOCS_DIR` points elsewhere. The API serves it at
`/api/glossary` (the console's `/app/glossary`). After editing the source:

```bash
uv run mudpuppy-glossary --write   # validate and regenerate docs/glossary/README.md
uv run mudpuppy-glossary           # validate only; fails if README.md is out of date
```

A broken source never breaks the dashboard: the glossary page lists the problems.

## Test

```bash
uv run ruff check && uv run pytest -n auto -m 'not perf and not serial' && uv run pytest -m 'perf or serial'
mudpuppy-dashboard-smoke --base http://127.0.0.1:8765   # a running dashboard answers
```

## Guarantees

- **Read-only.** The store is opened `file:…?mode=ro` with `PRAGMA query_only = ON`; the process
  cannot write even through a bug, and a missing store is reported, never created.
  `tests/test_readonly.py` hashes the store before and after reading every API address.
- **Local only.** Binds `127.0.0.1`; the config snapshot shows operator contact data.
- **Schema drift fails loudly.** `models.py` mirrors every table; `tests/test_models_schema.py`
  compares fields and enums against a store built from `data/migrations/*.up.sql`.

## Layout

Where each router and read model lives: [`LAYOUT.md`](LAYOUT.md). The console itself and its
design system: [`apps/web`](../web/) (skills `mudpuppy-react-ui` and `mudpuppy-salvage-ui`).
