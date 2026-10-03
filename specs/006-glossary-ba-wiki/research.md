# Research: Glossary and BA Wiki

## R1. Where the single source lives

- **Decision**: a top-level `docs/` folder: `docs/glossary/glossary.yaml` (entries),
  `docs/glossary/pages/*.md` (long explanations: evidence, frontier), `docs/wiki/*.md` (BA wiki).
  A generated `docs/glossary/README.md` is the repository view.
- **Rationale**: the glossary is project content, not code of one app. The dashboard already finds
  the repo root by walking up to `data/` (`settings.find_data_dir`), so it can read `docs/` the
  same way. `docs/` holds no language manifest, so the "no manifest at root" rule is untouched,
  and it is not an app, so the `apps/` rule is untouched.
- **Alternatives**: `apps/dashboard/glossary/` (rejected: the glossary is also for README
  readers and future R-16 export, not dashboard-owned); `packages/` (rejected: that is for shared
  code); `data/` (rejected: runtime data, not authored content).

## R2. Format of the source

- **Decision**: YAML for entries, Markdown for long pages and wiki pages, YAML front matter on
  wiki pages for citations.
- **Rationale**: YAML is easy to edit by hand and diff, holds multi-line text, and is already used
  for portal and persona configs. Long prose belongs in Markdown. Citations in front matter can be
  validated (title, URL, date checked) by a test.
- **Alternatives**: one big Markdown file parsed by headings (rejected: fragile to validate,
  hard to pull a one-sentence tooltip from); JSON (rejected: poor for prose).

## R3. Dashboard libraries

- **Decision**: add `pyyaml` and `markdown-it-py` to `apps/dashboard` dependencies. Glossary
  and citations are validated with Pydantic models (already a dependency).
- **Rationale**: both are small, pure Python, widely used. Markdown is rendered server-side with
  raw HTML disabled, so content cannot inject markup. No new front-end library.
- **Alternatives**: client-side Markdown rendering (rejected: adds JS, breaks no-JS reading);
  a hand-written mini Markdown renderer (rejected: reinventing).

## R4. Tooltip mechanics

- **Decision**: no JavaScript. A Jinja macro `m.term("<id>", "<Label>")` renders the label
  unchanged plus a small `[?]` link to `/glossary#<id>`, with the short definition in an element
  that has `role="tooltip"`, referenced by `aria-describedby`, and shown by CSS on `:hover` and
  `:focus-within`. On touch screens tapping `[?]` opens the glossary entry, which meets
  "reachable without hover". A macro `m.intro("<id>")` renders the always-visible line under a
  section heading.
- **Rationale**: matches the dashboard's htmx/no-build approach; works inside htmx-swapped
  fragments with no re-initialisation; `[?]` fits the bracketed console look (`[ OK ]`,
  `[switch]`). The native `title` attribute was rejected: not keyboard-reachable, not shown on
  touch, unstyleable.
- **Alternatives**: Popover API with JS hover handling (rejected: more code for no gain here);
  a tooltip library (rejected: new dependency, design-system mismatch).

## R5. Catching unknown terms

- **Decision**: a pytest test scans every template for `m.term("…")` and `m.intro("…")` calls
  and fails when an id is not in the glossary, naming template and id. At runtime an unknown id
  or an unreadable glossary renders the plain label (no crash) and the glossary page shows a
  notice (FR-011).
- **Rationale**: the check runs in the normal `uv run pytest` gate, so it fires on every
  commit, which is what makes the sync step enforceable.

## R6. README view

- **Decision**: `docs/glossary/README.md` is generated from the YAML by a dashboard console
  script `pathfinder-glossary` (`uv run pathfinder-glossary --write`). A test regenerates it in
  memory and fails if the committed file differs (SC-006: identical text).
- **Alternatives**: hand-maintained README (rejected: drifts); render the README at request time
  only (rejected: README readers do not run the dashboard).

## R7. Name for the renamed "Target" column

- **Decision**: **Links to**. The cell shows the element's `href` (or "—").
- **Rationale**: plain words, says what the value is, no clash with the evidence "Target".
- **Alternatives**: "Href" (developer jargon), "URL" (vague: which URL?), "Destination" (could be
  read as the resulting state, which Pathfinder records separately as a transition).

## R8. BA wiki sources and copyright

- **Decision**: cite public, stable pages only: IIBA BABOK Guide v3 (by edition, chapter and
  technique name; IIBA's public pages for URLs), IREB CPRE Glossary (freely published by IREB),
  ISO/IEC/IEEE 29148:2018 (ISO catalogue page). Each citation records title, edition, section,
  URL and date checked; URLs are verified when each page is written. Quotes are at most two
  sentences and attributed; everything else is in our own words.
- **Rationale**: FR-013/FR-014. BABOK and ISO texts are copyrighted and paywalled, so the wiki
  explains rather than copies; the local page stays readable if a link breaks.
- **Verified 2026-10-03 (T018)**: IREB CPRE Glossary is version 2.2.0 (2025), free from
  `cpre.ireb.org/en/downloads-and-resources/downloads`; its terms of use allow derived
  publications that cite it, so short definitions are quoted. BABOK v3 technique pages
  (`iiba.org/knowledgehub/.../10-techniques/10-NN-…/`) are behind IIBA's member login: cited by
  section number and marked "members only", never quoted or paraphrased as BABOK's wording.
  iso.org blocks automated checks, so 29148:2018 is cited via the public IEEE page
  `standards.ieee.org/ieee/29148/6937/` (title, status and scope confirmed); its SRS outline
  ("assumptions and dependencies") was confirmed from a published 29148:2018 SRS example. IREB has
  no entry for business rule, assumption, data dictionary or business capability; those pages
  cite BABOK or 29148 only. No concept was dropped.
- **Wiki page list (FR-015)**: requirement, non-functional-requirement, acceptance-criteria,
  business-rule, decision-table, use-case, data-dictionary, glossary, assumption,
  business-capability, process-modelling-as-is, traceability, requirements-validation,
  software-requirements-specification (14 pages).

## R9. Keeping it in sync

- **Decision**: add a "glossary sync" step before the changelog step in `.claude/agents/po.md`
  ("Closing an item") and in `CLAUDE.md` Feature Workflow step 4. Each entry has `changed_in`
  (roadmap id) and `changed_on` (date); the sync step updates them.
- **Rationale**: the po agent is the one closing items; CLAUDE.md is what every session reads.

## R10. Content accuracy

- **Decision**: each entry is written from the code and current specs, not from the review's
  draft definitions; where they disagree the code wins and the difference is noted in the
  feature's roadmap notes (FR-006). Examples come from `reference-insurer` sandbox data.
