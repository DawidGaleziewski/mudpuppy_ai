# Storage-engine policy

Default answer to "should we add another store?" is **not yet**. The constitution (Technical Constraints →
Storage; Governance) requires a documented justification for Postgres or a graph DB, and a version bump
if a Technical Constraint changes.

## Settle first (ask the user if you are the main agent; state assumptions if not)
- Data shape: relational rows, JSON blobs, key-value, or embeddings?
- Query patterns: point lookups by fingerprint/id, graph traversal, coverage aggregates, similarity search?
- Concurrency: how many processes write the same DB at once?
- Scale over 12–24 months: rows per run × runs × portals.

## Triggers that justify something else
| Need | First choice | Only if |
| --- | --- | --- |
| Several processes write one live DB | Serialise writes through one process | Serialising is impossible → Postgres |
| Similarity/embedding search (glossary consolidation, dedup) | `sqlite-vec` | Already moving to Postgres → `pgvector`; past a few million vectors or outgrown filtering/latency → dedicated vector DB |
| Full-text search beyond simple filters | SQLite `FTS5` | — |

Python (`uv`, offline NLP/embedding work) must not write to the DB except through the same Zod schemas and
migrations — that holds for any new store as well.

## Proposal format (for a plan's Complexity Tracking section)
1. Requirements and assumptions.
2. Recommended change and the source of truth per entity (SQLite / filesystem evidence / new store).
3. Why this and not the alternatives (SQLite-only baseline included).
4. Trigger to revisit: the concrete condition that would justify changing again.
5. Migration and rollout: which files, specs and contracts change; constitution amendment needed?
