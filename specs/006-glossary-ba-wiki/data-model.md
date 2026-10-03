# Data Model: Glossary and BA Wiki

All of this is authored content in files under `docs/`. Nothing is stored in SQLite; no
migration. The dashboard validates the files with Pydantic models on load.

## Glossary Entry (`docs/glossary/glossary.yaml`, list under `entries:`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string, kebab-case | yes | Unique; the anchor (`/glossary#<id>`) and the key templates use |
| `term` | string | yes | Display name, e.g. "Frontier" |
| `category` | `pathfinder` \| `ba` | yes | From `term-review.md` |
| `group` | string | yes | Section on the glossary page, e.g. "Crawling", "Record kinds" |
| `short` | string, one sentence, ≤ 200 chars | yes | Tooltip and section-intro text |
| `explanation` | string (Markdown) | yes | Longer text on the glossary page |
| `changed_in` | string, roadmap id (`R-22`) | yes | Last roadmap item that changed it |
| `changed_on` | date (`YYYY-MM-DD`) | yes | |
| `labels` | list of strings | no | UI labels/synonyms it covers ("Stabilization", "Edge") |
| `example` | string | no | Preferably from `reference-insurer` |
| `appears_in` | list of strings | no | Where in the UI ("Run page → Frontier") |
| `related` | list of ids | no | Each must be an existing id |
| `page` | slug | no | Long explanation in `docs/glossary/pages/<slug>.md` (evidence, frontier) |
| `wiki` | slug | no | BA wiki page in `docs/wiki/<slug>.md` |
| `placement` | `tooltip` \| `intro` | no, default `tooltip` | From `term-review.md` |
| `retired` | `{since: date, replaced_by: id \| null, note: string}` | no | Kept, shown as retired (`since`, not `on`: YAML 1.1 reads `on` as `true`) |

**Validation**: ids unique; `related`, `retired.replaced_by` resolve; `page` and `wiki` files
exist; `short` is one sentence; `category: ba` entries that have a recognised source carry
`wiki` (FR-015 list).

The file opens with a `scope:` note that this is Pathfinder's vocabulary, not the BA agent's
portal glossary (`GL` records) (FR-005).

## Long Page (`docs/glossary/pages/<slug>.md`)

Plain Markdown, first line `# <Title>`. v1: `evidence.md`, `frontier.md`.

## BA Wiki Page (`docs/wiki/<slug>.md`)

Front matter (YAML) then Markdown body.

| Front-matter field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | |
| `glossary` | list of ids | yes | Glossary entries that link here |
| `citations` | list of Citation, ≥ 1 | yes | |
| `changed_in`, `changed_on` | as above | yes | |

Body sections, in order: **What it is** (own words), **How Pathfinder uses it**, **Sources**
(rendered from `citations`, plus any short quotes).

## Citation

| Field | Type | Required | Notes |
|---|---|---|---|
| `source` | string | yes | e.g. "IIBA, A Guide to the Business Analysis Body of Knowledge (BABOK Guide)" |
| `edition` | string | yes | e.g. "v3 (2015)", "CPRE Glossary 2.x", "ISO/IEC/IEEE 29148:2018" |
| `section` | string | no | Chapter, technique or clause |
| `url` | https URL | yes | Original link |
| `checked_on` | date | yes | When the link and content were last verified |
| `quote` | string | no | ≤ 2 sentences (FR-014) |

## Relationships

- Entry `wiki` → Wiki page; wiki `glossary` → entries (both directions must agree).
- Entry `related` → entries.
- Template `m.term(id)` / `m.intro(id)` → entry.
