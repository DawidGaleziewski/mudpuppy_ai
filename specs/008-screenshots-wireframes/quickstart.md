# Quickstart: Screenshots and Wireframes (spec 008)

## Prerequisites

- `cd apps/crawler && pnpm install`; `cd apps/dashboard && uv sync`
- Reference portal running: `cd apps/crawler && pnpm reference-portal` (http://127.0.0.1:4010).
- MCP servers started with `PATHFINDER_ENV=sandbox`. They apply migration
  `0006_screenshots_wireframes` on start.

## 0. Wipe and re-crawl (no backfill, R10)

States recorded before 0006 have no screenshot or layout. Start clean:

```bash
cd /path/to/repo
mkdir -p data/db/backups && for f in data/db/*.sqlite; do mv "$f" "data/db/backups/$(basename "$f" .sqlite)-pre-0006.sqlite"; done
rm -f data/db/*.sqlite-wal data/db/*.sqlite-shm
rm -rf data/evidence && mkdir data/evidence
```

Optional: run `pnpm wireframes:build <portal> --env <env>` on an old store to get wireframes
for old states without wiping.

## 1. Automated checks

`pnpm typecheck && pnpm lint && pnpm test` in `apps/crawler` and `uv run ruff check && uv run
pytest` in `apps/dashboard` cover:

- the element-key golden fixtures, and identical keys from the YAML snapshot and from the layout
  tree;
- wireframe golden files (SVG and Excalidraw are byte-stable) and a schema check of the
  Excalidraw JSON;
- capture on the reference portal: a new state gets `screenshot_ref` and `layout_ref`; a known
  state does not get a new screenshot; a forced capture failure leaves the state recorded with a
  warning;
- map-mode autofill on `reference-insurer` (sandbox) reaches the calculator result; on
  `reference-insurer-readonly` (production) no POST appears in the portal's request log (SC-006);
- BA `screen_region` citations: an accepted key, an unknown key (`UNKNOWN_REF`) and `region`
  on a non-region kind (`SCHEMA_INVALID`);
- export determinism with images: two exports, `diff -r` empty (SC-005 in part, FR-020);
- dashboard `/evidence/{ref}` refuses non-image refs, and `/states/{id}` renders screenshot,
  wireframe and the "no screenshot" fallback.

## 2. Map with screenshots (US1, US5)

"Use the crawler agent to map portal `reference-insurer` as `guest`."

- `sqlite3 data/db/sandbox.sqlite "select count(*), count(screenshot_ref) from states"`: at
  least 95% of states have a screenshot (SC-001).
- At least one state behind a submitted form, e.g. the calculator result
  `/kalkulator/wynik`, is recorded (SC-006).

## 3. BA cites regions (US2)

"Use the ba agent to document portal `reference-insurer` from run `<run_id>`."

- `pnpm docs:audit reference-insurer --env sandbox`: exit 0. The `screen_region` links resolve.
- Every DI record and at least 80% of field-level BR records have at least one `screen_region`
  link (SC-002).

## 4. Dashboard (US1–US3)

`cd apps/dashboard && uv run pathfinder-dashboard`, then:

- Run detail → States: thumbnails, and each title opens `/states/<id>`, which has the screenshot,
  a "Show elements" toggle, a Wireframe tab and two downloads.
- Open a DI record: the Screens panel shows the screenshot with the cited field outlined and
  numbered. Spot check 20 citations (SC-003).
- Download an `.excalidraw` file and open it on excalidraw.com: same layout, editable (SC-004).

## 5. Export (US4)

```bash
pnpm docs:export reference-insurer --env sandbox
cp -r data/exports/reference-insurer-sandbox-srs /tmp/a
pnpm docs:export reference-insurer --env sandbox
diff -r /tmp/a data/exports/reference-insurer-sandbox-srs   # empty
```

Open `03-screens.md` in a Markdown viewer. Every SCR shows a screenshot and a wireframe, and the
highlight images appear under DI/BR records. Zip the folder, unzip it elsewhere, and check that
the links still work (SC-005).

## 6. User review (SC-007)

The user reviews the reference portal docs in the dashboard and confirms the screens and rules
are understandable without opening the portal.

## Validation notes

### 2026-10-04: scripted map of the reference portal (T040, part 1)

The MCP servers of the building session predated the changes, so the map ran through the real
server code with the test harness's frontier loop (`get_next_frontier_item` → `act` until empty),
not the crawler agent. Portal `reference-insurer` (sandbox) with the real `guest` persona; rate
limit raised to 20 rps for speed.

- Run `completed`, 320 steps, 157 s; frontier 319 done, 35 `budget_reached`.
- **SC-001**: 21 states, 21 with a screenshot and layout (100%), 21 wireframes; no
  `capture_failed` or `wireframe_failed` warning. Capture took 38 ms on average (max 56 ms).
- **SC-006**: 8 form autofills, and states only reachable behind a submitted form were recorded:
  `/kalkulator/kierowca`, `/kalkulator/opcje`, `/kalkulator/wynik`, `/kalkulator/zakup`,
  `/kontakt/dziekujemy`, `/porownanie/wynik`, `/ubezpieczenia/podroze/wynik`. During R-16
  `/kalkulator/wynik` and `/porownanie/wynik` were unmapped in map mode. POSTs sent: `/kontakt`,
  `/logowanie` (twice, rejected login), `/kalkulator/zakup`. The production side (no POST) is
  covered by `mcp-server/tests/autofill.test.ts`.

### 2026-10-04: crawler agent map and BA session (T040 part 2, T041 part 1)

Stores wiped per §0 (backups in `data/db/backups/*-pre-0006*`). The first agent run stalled on a
navigate frontier item that could never be settled (findings F-10, fixed in `075bbd1`); the
store was wiped again and re-mapped on the fixed servers.

- Map run `01a1083f-5472…` (crawler agent, `guest`, sandbox): `completed`, 320 steps; frontier
  319 done, 35 `budget_reached`, 0 pending. The last item, the login submit, was pressed with the
  user's explicit approval and returned "Nieprawidłowy login lub hasło.".
- **SC-001**: 21 states, 21 with a screenshot and layout (100%), 21 wireframes.
- **SC-006**: 8 states behind a submitted form, including `/kalkulator/wynik`,
  `/kalkulator/zakup`, `/porownanie/wynik`, `/ubezpieczenia/podroze/wynik`,
  `/kontakt/dziekujemy` and the login error state.
- BA session `01a1085a-d66f…`: 128 revisions over 123 records (19 SCR, 26 DI, 33 BR, 5 REQ,
  12 GL, 5 PROC, 6 CAP, 2 NFR, 3 ASM, 7 OQ, 5 FUP). No `UNKNOWN_REF`; one `SCHEMA_INVALID` on a
  process field, unrelated to regions.
- **SC-002**: met. 26/26 DI and 32/33 BR have a `screen_region` link (all 27 field-level BR).
  BR-033 cites the state, because the purchase confirmation text has no layout key.
- `pnpm docs:audit reference-insurer --env sandbox`: `ok: true`, 0 findings, 315 links.
- **SC-005**: met. Two exports are byte-identical (`diff -r` empty, 158 files). After `tar` and
  extracting elsewhere (no `zip` on this machine), all 143 image links in the Markdown resolve:
  19 screenshots, 19 SVG + 19 `.excalidraw` wireframes, 86 highlight crops.
- **SC-003** (partial, from the export): DI-001 "Marka" and BR-031 (the login alert) outline the
  right element. DI-011 "Zakres" outlines both radios, but the crop cuts the labels off on the
  right (findings F-12).

Still open: SC-003 dashboard spot check of 20 highlights, SC-004 open an `.excalidraw` on
excalidraw.com, then the user review (SC-007).

### 2026-10-05: user dashboard review (T041 part 2, T043)

- **SC-003**: met. The user checked the region highlights in the dashboard and reported they
  work exactly as planned (rated 10/10). The F-12 crop issue affects the export crops only.
- **SC-007**: met. The user reviewed the reference portal docs in the dashboard and confirmed
  them ("amazing", 10/10).

- **SC-004**: deferred by the user (nice to have, verify later). Wireframes exist for every
  state and two generations are identical (T040); opening an `.excalidraw` file on
  excalidraw.com is not yet checked. Tracked in the roadmap notes.
