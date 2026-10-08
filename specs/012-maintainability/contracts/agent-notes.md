# Contract: per-package agent notes (`CLAUDE.md`)

One file in the root of every workspace package and app. Claude Code loads it when it works in
that folder. Short (≤ ~60 lines), facts only, no history (history is in specs and the changelog).
Final wording of the template is part of the guidelines rating.

```markdown
# @pathfinder/<name>

<One sentence: what this package is for.>

Layer: <kernel | models | store | features | servers> (see apps/crawler/layers.json)

## Public API
- `<export>`: <what it does>; used by <packages>.

## Invariants
- <rule that must always hold, e.g. "pure: no browser, no LLM, no DB" or "writes only through …">

## Where to add things
- New <thing>: <file or folder>, following <existing example>.

## Tests
- `<pnpm command>`; tier: <fast | slow (e2e) | gates>. Fixtures in <path>.

## See also
- specs/<nnn>/… (the spec that defined it), docs/code-guidelines.md
```
