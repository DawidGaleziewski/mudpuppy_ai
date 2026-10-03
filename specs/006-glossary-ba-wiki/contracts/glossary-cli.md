# Contract: `pathfinder-glossary` command

Console script in `apps/dashboard` (`[project.scripts]`), run as
`uv run pathfinder-glossary [--check | --write]` from `apps/dashboard`.

| Mode | Behaviour | Exit |
|---|---|---|
| `--check` (default) | Loads and validates `docs/glossary/glossary.yaml`, pages and wiki front matter; renders the README in memory and compares it with `docs/glossary/README.md` | 0 ok; 1 validation error or README out of date (prints each problem: file, entry id, field) |
| `--write` | Validates, then writes `docs/glossary/README.md` | 0 ok; 1 validation error (nothing written) |

The generated README is deterministic (Pathfinder terms, then BA terms; groups and entries in the
order `glossary.yaml` lists them, which is a reading order; LF endings), so
two runs give identical bytes. It contains every entry's term, short definition, explanation,
example, links to long pages and wiki pages (relative Markdown links), and the scope note.
