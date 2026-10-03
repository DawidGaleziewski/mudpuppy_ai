# Quickstart: validate R-22

Prerequisites: `apps/dashboard` installed (`uv sync`), a sandbox store with the
`reference-insurer` runs (`data/db/sandbox.sqlite`). Kill any stale dashboard process first.

## 1. Gates

```bash
cd apps/dashboard
uv run pathfinder-glossary --check      # exit 0
uv run pytest && uv run ruff check . && uv run ruff format --check .
```

Expected: the glossary tests pass, including "every template term exists", "README up to date",
"every Must/Nice term from term-review.md has an entry", "every wiki page has ≥ 1 complete
citation".

## 2. Unknown-term check (SC-005)

Temporarily add `{{ m.term("not-a-term", "X") }}` to any template and run `uv run pytest`.
Expected: one failure naming the template and `not-a-term`. Revert.

## 3. In the browser (`PATHFINDER_DEFAULT_ENV=sandbox uv run pathfinder-dashboard`)

1. Top nav shows **Glossary**; `/glossary` lists all entries; typing "front" leaves Frontier.
2. Open a `reference-insurer` map run: the Run header and States observed show a one-line intro;
   hover and Tab onto the `[?]` next to **Frontier**, **Cluster**, **Safety class**: the short
   definition appears; clicking `[?]` opens `/glossary#frontier`.
3. Actions table header reads **Links to**, not Target.
4. Docs tab → any record → evidence table: **Target** has a tooltip.
5. Phone width (≈400px): tapping `[?]` opens the glossary entry; no horizontal page scroll.
6. Frontier and Evidence entries link to their long pages.
7. A BA entry (e.g. Business rule) links to `/glossary/wiki/business-rule`; the page shows
   citations with source, edition, URL and checked date. Disconnect from the network: it still
   reads.

## 4. Repository view (SC-006)

Open `docs/glossary/README.md` on GitHub or in an editor: same entries and text as the
dashboard page.

## 5. Sign-off (SC-002)

The user reads only the glossary and explains back what the frontier is and what evidence a run
gathers, where it is stored and how the BA uses it.

## 6. Broken file (FR-011)

Introduce a YAML syntax error in `glossary.yaml` and reload: the dashboard still works, labels
render without `[?]`, `/glossary` shows a `[WARN]` notice. Revert.
