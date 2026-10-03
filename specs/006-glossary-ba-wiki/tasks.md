---
description: "Task list for R-22 Glossary and BA Wiki"
---

# Tasks: Glossary and BA Wiki

**Input**: Design documents from `specs/006-glossary-ba-wiki/` (spec.md, term-review.md, plan.md,
research.md, data-model.md, contracts/, quickstart.md)

**Tests**: included. The spec requires automated checks (FR-010, SC-005, SC-006), and the repo
gates (`uv run pytest && uv run ruff check . && uv run ruff format --check .` in
`apps/dashboard`) run before every commit.

**Model split**: each task is tagged `[opus]` (writing and verifying content, judgement) or
`[sonnet]` (mechanical code). See the table at the end.

**Paths**: content in `docs/`; code in `apps/dashboard/src/pathfinder_dashboard/` (abbreviated
`pd/` below); tests in `apps/dashboard/tests/`.

## Phase 1: Setup

- [X] T001 [sonnet] Add `pyyaml` and `markdown-it-py` to `dependencies` and the console script `pathfinder-glossary = "pathfinder_dashboard.glossary_cli:main"` to `[project.scripts]` in `apps/dashboard/pyproject.toml`; `uv sync` from `apps/dashboard`; gates still pass
- [X] T002 [sonnet] Add `docs_dir: Path` to `Settings` in `pd/settings.py`, default `find_data_dir().parent / "docs"` (env `PATHFINDER_DOCS_DIR`); create empty `docs/glossary/pages/` and `docs/wiki/` folders (each with a placeholder removed once real files land). As built: no placeholders needed, the loader accepts missing folders

## Phase 2: Foundational (blocks all stories)

- [X] T003 [sonnet] Failing tests `apps/dashboard/tests/test_glossary.py` on a small fixture tree under `apps/dashboard/tests/fixtures/glossary/` (3 entries, 1 page, 1 wiki page): valid fixture loads; each data-model rule rejects with an error naming file, entry id and field — duplicate `id`; `id` not kebab-case; missing required field (`id`, `term`, `category`, `group`, `short`, `explanation`, `changed_in`, `changed_on`); `category` not in `pathfinder | ba`; `placement` not in `tooltip | intro`; "`short`, one sentence, ≤ 200 chars" violated; `related` / `retired.replaced_by` not an existing id; `page` file missing in `pages/`; `wiki` file missing; wiki front matter missing `title`, `glossary`, `changed_in`, `changed_on` or with zero `citations`; citation missing `source`, `edition`, `url` (https), `checked_on`; `quote` longer than 2 sentences; entry `wiki` and wiki `glossary` not pointing at each other
- [X] T004 [sonnet] Implement `pd/glossary.py`: Pydantic models `Entry`, `Retired`, `WikiPage`, `Citation` per data-model.md; `load_glossary(docs_dir) -> Glossary | GlossaryError` (never raises to callers; collects all problems); `Glossary.get(id)`, `.entries_by_group()`, `.page_html(slug)`, `.wiki_html(slug)`; Markdown via `markdown-it-py` with `html=False`; YAML via `yaml.safe_load`. T003 passes

## Phase 3: User Story 1 — Look up any term in one place (P1) 🎯 MVP

**Goal**: one source with the 59 Must/Nice terms, readable as a repo README and as a dashboard
Glossary page.
**Independent test**: every Must/Nice term from `term-review.md` is in `docs/glossary/README.md`
and on `/glossary`, with identical text.

- [X] T005 [P] [US1] [sonnet] Failing tests in `apps/dashboard/tests/test_glossary.py`: the real `docs/glossary/glossary.yaml` validates; it contains exactly the 59 Must/Nice terms of `term-review.md` (hard-coded expected id list in the test); `placement: intro` exactly for `run`, `state`, `analysis-session`, `gaps`; `frontier` and `evidence` have `page`; README render is deterministic (two renders byte-identical) and equals the committed `docs/glossary/README.md`
- [X] T006 [US1] [opus] Write `docs/glossary/glossary.yaml`: opening `scope:` note (Pathfinder's vocabulary; not the BA agent's `GL` portal glossary, FR-005); the 59 entries from `term-review.md` with ids, `category`, `group`, `short`, `explanation`, `labels` (dashboard labels each covers, e.g. `Stabilization` for settled, `Edge` for transition, every bracketed code for status codes), `example` from `reference-insurer` sandbox data where one exists, `appears_in`, `related`, `placement`, `changed_in: R-22`, `changed_on`. Write each from the code and current specs, not the review drafts (FR-006); list any code/spec disagreements found in a scratch list for T030. Two-meaning terms (process, target) name each meaning and where it appears
- [X] T007 [P] [US1] [opus] Write `docs/glossary/pages/frontier.md` (spec US1 scenario 3): the fog-of-war idea (seen but not yet followed), that "crawl frontier" is the standard crawler/graph-search term and not a BA term, how an item enters, gets picked (priority, then age), ends `done` or skipped with a reason, budgets, what an empty frontier means, and that Pathfinder's table also keeps history; one worked example from a `reference-insurer` map run (real counts from `data/db/sandbox.sqlite`)
- [X] T008 [P] [US1] [opus] Write `docs/glossary/pages/evidence.md` (FR-004): every evidence kind (masked ARIA snapshot, form fields, action descriptor with ranked locators and safety class, network call shape, console errors, process steps, decisions, Playwright trace with screenshots on non-production only), what each contains, where stored (`data/evidence/` content-addressed by sha256, SQLite tables, per-environment DB), which run modes/environments gather it, what is never gathered and why (screenshots on production, request bodies, PII), and how the BA reads and cites it (evidence links on records, `get_run_evidence`, the Target column). Verify each claim against `apps/crawler/packages/core/src` and the mcp-server; one real example per kind from the sandbox store
- [X] T009 [US1] [sonnet] Implement `render_readme(glossary) -> str` in `pd/glossary.py` per contracts/glossary-cli.md (sorted by category, group, term; LF; relative links to `pages/` and `../wiki/`) and `pd/glossary_cli.py` (`--check` default, `--write`; exit codes per contract). Run `uv run pathfinder-glossary --write` to create `docs/glossary/README.md`. T005 passes
- [X] T010 [US1] [sonnet] Failing tests `apps/dashboard/tests/test_glossary_routes.py`: `GET /glossary` 200 with every entry id as an anchor and the scope note; `?q=front` keeps Frontier and hides Cluster; `GET /glossary/pages/frontier` 200, unknown slug 404 page; nav shows Glossary with `aria-current` on the glossary page; `?env=` preserved in links; with `PATHFINDER_DOCS_DIR` pointing at a broken YAML the page shows `[WARN]` and `/` still returns 200 (FR-011)
- [X] T011 [US1] [sonnet] Routes `GET /glossary` and `GET /glossary/pages/{slug}` in `pd/app.py` (glossary loaded once in `create_app`, reloaded per request when `settings.dev`); templates `pd/templates/glossary.html` (scope note, GET filter form `q` + small inline JS filter-as-you-type, groups by category then group, entry: term, category tag, short, explanation, example, appears in, related links, read-more link, last changed, retired marker) and `pd/templates/glossary_page.html`; nav item in `pd/templates/base.html`; styles in `pd/static/css/app.css` using only existing tokens, per skill `revamp-dashboard`. T010 passes

**Checkpoint**: commit US1 (T001–T011) after gates pass.

## Phase 4: User Story 2 — Understand a term where it appears (P2)

**Goal**: `[?]` tooltips on labels, one-line intros on four sections, "Target" disambiguated.
**Independent test**: on a run page and a Docs record page every glossary-backed label shows its
definition on hover and keyboard focus and links to `/glossary#<id>`.

- [X] T012 [P] [US2] [sonnet] Failing test `apps/dashboard/tests/test_glossary_templates.py`: scan every file under `pd/templates/` for `m.term("<id>"` and `m.intro("<id>"` and fail, naming template and id, when an id is not in the real glossary (SC-005); also fail if `partials/actions.html` still has a `Target` header
- [X] T013 [US2] [sonnet] Macros `term(id, label)` and `intro(id)` in `pd/templates/partials/macros.html` exactly per contracts/dashboard-ui.md (`[?]` link to `/glossary#id` with `?env`, `role="tooltip"` element referenced by `aria-describedby`, unique ids per page; unknown id or no glossary → plain label / nothing); expose the glossary as a Jinja global in `pd/app.py`; CSS `.gl`, `.gl-mark`, `.gl-tip` (shown on `:hover` and `:focus-within`, positioned so it never causes horizontal scroll at 400px, `prefers-reduced-motion`), `.section-intro` in `pd/static/css/app.css`
- [X] T014 [US2] [sonnet] Apply `m.intro` to Run (`partials/run_header.html`), States observed (`partials/states.html`), Analysis session (`partials/docs/session.html` header), Gaps (`partials/docs/session.html`)
- [X] T015 [US2] [sonnet] Apply `m.term` to every column header, section title and status legend whose term is Must/Nice with `placement: tooltip` (use each entry's `labels` to find them): run tables, actions, frontier, states, network, decisions, process, trace, docs index/records/body/reviews/session templates under `pd/templates/partials/`. Rename the Actions header `Target` → `Links to` in `partials/actions.html` (cell unchanged); give the evidence-table `Target` in `partials/docs/body.html` its tooltip. T012 passes
- [X] T016 [US2] [sonnet] Extend `apps/dashboard/tests/test_glossary_routes.py`: a run page fragment and a docs record fragment contain `.gl` markup with `role="tooltip"` and the right `href`; Actions header reads `Links to`; existing route tests still pass (update any that asserted `Target`)

**Checkpoint**: commit US2 (T012–T016) after gates pass.

## Phase 5: User Story 3 — BA concepts from trusted sources (P3)

**Goal**: 14 local wiki pages with verified citations, linked from BA entries.
**Independent test**: from a BA entry, its wiki page opens offline and every citation has source,
edition, URL and checked date.

- [X] T017 [P] [US3] [sonnet] Failing tests in `apps/dashboard/tests/test_glossary_routes.py` and `test_glossary.py`: the 14 slugs of research R8 exist under `docs/wiki/`; every BA entry whose concept is on that list has `wiki`; `GET /glossary/wiki` lists 14 pages; `GET /glossary/wiki/business-rule` 200 shows citations; unknown slug 404; rendered wiki HTML contains no raw HTML from the Markdown source
- [X] T018 [US3] [opus] Verify sources: for IIBA BABOK Guide v3, IREB CPRE Glossary and ISO/IEC/IEEE 29148:2018 fetch the public pages, record the exact URL per concept (technique/term page where one exists, else the publication page) and the check date; note any concept with no recognised public source and drop it from the list with a note in `research.md` R8
- [X] T019 [US3] [opus] Write wiki pages `docs/wiki/requirement.md`, `non-functional-requirement.md`, `acceptance-criteria.md`, `business-rule.md`, `decision-table.md`, `use-case.md`, `data-dictionary.md` with front matter per data-model.md ("`citations` list ≥ 1"; "`quote` ≤ 2 sentences") and sections What it is / How Pathfinder uses it / Sources; own words, no copied passages (FR-014)
- [X] T020 [US3] [opus] Same for `glossary.md`, `assumption.md`, `business-capability.md`, `process-modelling-as-is.md`, `traceability.md`, `requirements-validation.md`, `software-requirements-specification.md`; `docs/wiki/README.md` index; set `wiki:` on the matching entries in `docs/glossary/glossary.yaml`; regenerate README (`uv run pathfinder-glossary --write`)
- [X] T021 [US3] [sonnet] Routes `GET /glossary/wiki` and `GET /glossary/wiki/{slug}` in `pd/app.py`, templates `pd/templates/wiki.html` and `pd/templates/wiki_page.html` (citations rendered as a list: source, edition, section, link, "checked <date>", quote); "Read more" on entries links there. T017 passes

**Checkpoint**: commit US3 (T017–T021) after gates pass.

## Phase 6: User Story 4 — Keep it current (P3)

- [X] T022 [P] [US4] [sonnet] Add step "Glossary sync: add or update `docs/glossary/glossary.yaml` entries (and `changed_in`/`changed_on`) for every term the item added or changed; run `uv run pathfinder-glossary --write`" before the changelog step in "Closing an item" of `.claude/agents/po.md`; run `python3 .claude/skills/subagent-authoring/scripts/lint_agent.py .claude/agents/po.md --root .` and fix errors
- [X] T023 [P] [US4] [sonnet] Add "glossary sync" before "run the changelog skill" in Feature Workflow step 4 of `CLAUDE.md`
- [X] T024 [US4] [sonnet] Glossary page shows `changed_in` and `changed_on` per entry (already in T011; verify) and test in `test_glossary_routes.py` that `R-22` appears for `frontier`

**Checkpoint**: commit US4 (T022–T024) after gates pass.

## Phase 7: Polish & validation

- [X] T025 [P] [sonnet] Docs: `apps/dashboard/README.md` (Glossary page, `PATHFINDER_DOCS_DIR`, `pathfinder-glossary`), root `README.md` (link to `docs/glossary/README.md` and `docs/wiki/`)
- [X] T026 [sonnet] Full gates from `apps/dashboard`: `uv run pathfinder-glossary --check && uv run pytest && uv run ruff check . && uv run ruff format --check .`; from `apps/crawler`: `pnpm typecheck && pnpm lint && pnpm test` (unchanged, still green)
- [X] T027 [opus] Score the new screens with skill `revamp-dashboard` (glossary page, wiki page, tooltips at desktop and 400px, both themes); fix findings
- [X] T028 [opus] quickstart.md steps 1–4 and 6 (kill stale dashboard processes first); record results in `roadmap.md` notes
- [X] T029 [opus] User sign-off, quickstart step 5 (SC-002): the user reads the glossary and confirms frontier and evidence are clear; fold any feedback into entries
- [X] T030 [opus] Update `roadmap.md` (R-22 `done`, notes: scope from `term-review.md`, code/spec disagreements from T006, rename), run skill `speckit-analyze`, then close via `po` (changelog before merge)

## Dependencies

- Setup (T001–T002) → Foundational (T003–T004) → US1.
- US2 needs US1's glossary (T006) and loader; US3 needs the loader and the glossary page; US4
  is independent after US1.
- Polish last.

## Parallel opportunities

- US1: T005 ∥ T007 ∥ T008 (T006 first for ids, but pages can be drafted alongside).
- US2: T012 ∥ T013.
- US3: T017 ∥ T018; T019 ∥ T020 after T018.
- US4: T022 ∥ T023.
- US3 and US4 can run in parallel with US2 once US1 is done.

## Implementation strategy

MVP = US1 (T001–T011): the user can already look up every term in the README and on
`/glossary`. Then US2 (tooltips, the biggest UX gain), US3 (wiki), US4 (process), polish.

## Model split

| Tag | Tasks |
|---|---|
| `[opus]` | T006, T007, T008, T018, T019, T020, T027, T028, T029, T030 |
| `[sonnet]` | T001, T002, T003, T004, T005, T009, T010, T011, T012, T013, T014, T015, T016, T017, T021, T022, T023, T024, T025, T026 |
