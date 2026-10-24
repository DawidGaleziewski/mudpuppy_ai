---
name: roadmap-lazy-checker
description: Shows the owner the state of every open roadmap item at a glance, grouped by category (2.0, React console, frozen), with each open part marked as doable now or waiting for the owner, the designer, a budget or something else, and a short summary at the end. Read only. Use when the owner asks for the roadmap status, "what can be done", "what is waiting", "show me the roadmap again", or a status check before picking the next item. Not for editing the roadmap or rating items (po agent).
---

# Roadmap lazy checker

The owner liked this view (2026-10-25): one look, no digging. Read only: change nothing, commit
nothing.

## 1. Gather (read only)

- `roadmap.md`: every row whose status is not `done` or `rejected`, **plus** `done` rows whose
  status still lists leftovers ("done except …", "Left: …", "Leftovers: …"). The rows are long:
  pull the ID, the item text and the status column with `grep`/`awk` instead of reading the
  whole file. Read the full text of each leftover row: the numbered parts (1), (2) … are what you
  sort.
- The newest `session_dump/*.md`: its "Next", "Still the owner's" and "Uncommitted" sections,
  which are often newer than the roadmap labels.
- `git status`: uncommitted changes on master are worth a line at the end.
- If a roadmap label says "waits for the designer" but the session dump (or
  `docs/design/salvage-yard/docs/`) shows the answer has arrived, say it is unblocked and that
  the label is stale.

## 2. Group

1. **2.0 (crawler, BA, evals)**: backend, crawler, BA and eval leftovers (e.g. R-84, R-85,
   R-97, R-98, R-99, R-35, R-91's leftovers).
2. **React console**: apps/web, the Workbench, the designer's rounds (e.g. R-94, R-95, R-96,
   R-102, R-104, R-105, R-106's leftovers).
3. **Frozen**: rows whose status is `frozen …` or that are listed as not rated yet. One line each
   with its short state, then a line saying they all wait for the owner's rating.

Put a new category in only when an item fits neither of the first two.

## 3. Mark each open part

Start with this key: ✅ can be done now · 🧑 waits for the owner's decision · 🎨 waits for the
designer · 💰 needs a budget for paid runs · ⏳ waits for something else (labels, upstream, another
item; say which).

One table per category: `| Item | What's left | Status |`. Put the item's ID and its short name
in bold in the first row; give each part a row of its own when parts of one item have different
statuses. Keep each cell to about one line, in plain words. Put the part numbers in, e.g. "(3)",
so the owner can find them in the roadmap.

## 4. End with a short summary

Under "In short": **Can start now** (the suggested next bundle first), **your decisions**,
**budget**, **your labels / other waits**, then any uncommitted work and where it should go.
After that, one line offering a rating page (skill/memory "propose, user rates") for the
decisions and the frozen rows. Do not build it unless the owner asks.

## Style

Plain words, short sentences, no history of how the item got there. Don't make up a status:
when the roadmap and the session dump disagree, say so in that row.
