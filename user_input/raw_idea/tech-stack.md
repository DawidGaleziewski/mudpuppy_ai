Tech stack, algorithms, and data structures

I'm assuming TypeScript, since Playwright, the Test Agents and the MCP SDK are TypeScript-first and your generated output is TypeScript anyway. If you prefer Python, everything below has a direct equivalent except the Test Agents tooling.

Stack
Concern	Choice	Notes
Runtime	Node 22+, TypeScript (strict), pnpm workspaces	Monorepo, one package per module
Browser automation	playwright (library) for the crawler, @playwright/test for generated tests	Two uses, kept separate
Storage	SQLite (better-sqlite3) with Kysely or Drizzle	Single file, transactional, easy to snapshot per run. Move to Postgres only if multiple writers are needed
Graph queries	Relational tables plus recursive CTEs, with an in-memory graph for algorithms	Neo4j/Kuzu only if CTEs become painful
Schemas and validation	Zod (or TypeBox) as the single source of truth, emitting JSON Schema	Same schemas validate agent output, MCP inputs and DB writes
Agent-facing tools	@modelcontextprotocol/sdk (your MCP server)	Thin layer over your core library
Agent orchestration	Claude Agent SDK or claude -p with JSON-schema output	Harness owns the queue and budgets
Job queue	A jobs table in SQLite (status, lease, retries)	No Redis needed at this scale
Evidence storage	Filesystem with content-addressed names (sha256), paths in DB	Snapshots, traces, screenshots
Diagrams and docs	Mermaid generated from DB, Markdown via templates (Handlebars or plain template literals)	Diffable, LLM-friendly
Test quality gates	eslint-plugin-playwright, tsc --noEmit, Playwright JSON reporter	Enforced mechanically
Harness tests	Vitest, with a fixtures corpus of saved ARIA snapshots and HARs	Lets you test the fingerprinter and classifier offline
Logging	pino (structured JSON), with decision logs stored in DB	Every skip, merge and split is auditable
Local target app	A demo app you control (docker-compose) with resettable seed data	Essential for safe mutating exploration
Package layout
packages/
  core/          schemas (Zod), DB access, ids, graph in-memory model
  crawler/       policy, session, executor, stabilizer, observer, frontier
  fingerprint/   normalization + hashing + similarity (pure functions)
  safety/        action classifier, denylist, env guard
  obstacles/     shared handlers/fixtures (used by crawler AND tests)
  mcp-server/    record_step, link_process, get_known_states, ...
  orchestrator/  job queue, agent runner, budgets, promotion rules
  analysis/      process mining, linking, graph diff, permission matrix
  testgen-kit/   helper library: components, fixtures, flow helpers
  runner/        executes specs, ingests JSON reporter into DB
  docs/          Markdown + Mermaid renderers
agents/          subagent definitions (explorer, ba, qa, triager)
skills/          role rules and conventions

The rule to keep: fingerprint, safety and analysis are pure functions with no browser or LLM dependency, so you can unit-test them against saved data.

Data model

Layer A (mechanical)

sql
runs(id, persona_id, env_version, seed_id, viewport, locale, browser, started_at, config_json)
states(id, fingerprint UNIQUE, route_template, title, aria_ref, cluster_id, first_seen_run)
state_observations(state_id, run_id, persona_id, evidence_ref)   -- who saw it, when
edges(id, from_state, to_state, action_json, safety_class, run_id, status)
network_calls(id, edge_id, method, url_template, status, req_schema, res_schema)
forms(id, state_id, fields_json)
frontier(id, run_id, state_id, action_json, safety_class, status, reason)

Layer B (semantic)

sql
personas(id, name, auth_ref)
processes(id, name, persona_id, goal, preconditions, postconditions, status)
steps(id, process_id, ord, intent, edge_id, outcomes_json, confidence)
process_links(from_process, to_process, kind)     -- requires | triggers | includes | precedes
rules(id, text, kind, source_step_id, confidence, status)
requirements(id, text, acceptance_json, status, process_id)
tests(id, requirement_id, process_id, file, kind, status)   -- kind: characterization | acceptance
test_results(id, test_id, run_id, outcome, duration, trace_ref, failure_class)
open_questions(id, text, about_ref, status)
glossary(term, definition, aliases_json)

Two conventions matter: status columns drive the pipeline (recorded → replay_verified → documented, draft → confirmed → tested), and every semantic record carries a confidence and a source reference, so nothing exists without evidence.

Core data structures
Structure	Used for
Canonical ARIA tree (role, name, children, masked)	Input to fingerprinting
Fingerprint = { exact: sha256, structure: shingle set / SimHash }	Exact dedupe plus near-duplicate clustering
Trie of URL path segments	Route-template inference
Priority queue (binary heap)	Frontier ordering
Hash set / Map (Map<fingerprint, StateId>)	Visited states, O(1) lookup
Directed multigraph (Map<StateId, Edge[]> adjacency list, loaded from DB)	Pathfinding, reachability, graph diff
Path store (per state: shortest known action path from entry)	Reaching a state for replay
Union-Find	Merging states into clusters
DAG of processes	Dependency ordering, cycle detection
Decision table (conditions × actions)	Business rules, and input to test generation
Job queue rows with leases	Resumable orchestration
Algorithms

Crawler and identity

URL normalization and route-template inference. Normalize per RFC 3986, then insert observed paths into a trie. A segment position with high cardinality, or one that matches numeric, UUID or long-hash patterns, collapses to :param. Keep low-cardinality segments literal (/admin/users).
ARIA canonicalization. Walk the accessibility tree, keep role and accessible name, drop volatile nodes, mask numbers, dates, emails and IDs by regex and type, sort where order is irrelevant (e.g. sets of tags), and serialize.
Two-level fingerprint. Level 1 is sha256(routeTemplate + canonicalTree + overlays) for exact identity. Level 2 is a set of shingles (role+name pairs, or role paths) hashed with SimHash or MinHash, so near-duplicates can be compared by Jaccard or Hamming distance. If Level 1 differs but Level 2 similarity exceeds a threshold (say 0.9), assign the same cluster. This gives you tunable granularity without recrawling.
Frontier scheduling. A priority queue keyed on depth (BFS default), with optional novelty boosts for actions that previously led to new states. Round-robin across states prevents one huge page from starving the crawl.
Trap detection. Track the sliding window of fingerprints and cluster ids. If N consecutive actions yield states in the same cluster, or state count grows without new route templates, stop expanding that branch. Add per-template state caps.
Stabilization. Wait until network is idle for a window, a MutationObserver reports no mutations for T ms, and no animations are running, with a hard timeout and a "never stabilized" flag in the record.
Path finding to a state. BFS over the graph for shortest replay paths, or Dijkstra if edges have costs (unreliable or slow edges cost more). Cache the best path per state, and invalidate on failure.
Safety classification. A rules engine that scores signals (role, label keywords such as delete, pay, send, logout, HTTP method, form action, aria-* hints, and the network method observed on a prior run) and takes the most dangerous class across signals. Ambiguous means unsafe.

Analysis

Graph diff between crawls. Match by fingerprint or cluster, then report added, removed and changed states and edges. This is what powers "requirement drift" detection.
Permission matrix. For each persona, a set of reachable route templates and actions. The matrix is a set difference and intersection across personas, and it's a very cheap and useful BA artifact.
Process discovery from trajectories. Ordered lists of edges recorded by the explorer are the event log. Apply lightweight process mining: build a directly-follows graph, cluster identical variants, and separate the happy path (most frequent or goal-reaching variant) from alternates and exceptions.
Process linking. Match one process's postconditions to another's preconditions (set containment over normalized conditions such as authenticated, cart_nonempty). Then run cycle detection and topological sort on the resulting DAG. Use strongly connected components if loops are legitimate.
Glossary consolidation. Normalize terms (lowercase, lemmatize) and cluster near-duplicates with edit distance, and optionally embeddings. Flag candidate synonyms for a human, and don't auto-merge.

Test generation and results

Rule to case mapping. From a decision table, generate one case per rule row. For boundary rules use boundary value analysis. For many independent inputs use pairwise generation (IPO or an off-the-shelf allpairs library). For state machines use transition coverage (each edge at least once) via a graph traversal.
Flakiness scoring. Track pass/fail over the last N runs and compute a Wilson score interval on the pass rate, so small samples aren't overtrusted. Quarantine when the interval falls below a threshold.
Failure triage. Rules first, model second. Deterministic classifiers (timeout on locator → brittleness candidate, 5xx or connection errors → environment, assertion mismatch against a confirmed requirement → defect candidate). Only ambiguous cases go to the triager agent. Cluster failures by normalized error signature (strip IDs and timestamps, then hash) so repeated causes surface as one issue.
Replay verification. Deterministically re-execute the recorded path from a reset state, and compare per-step state fingerprints (cluster level) plus expected outcomes. Promote to replay_verified only if all steps match.
Pipeline and job flow
crawl job ──► states/edges/frontier
explorer job (per frontier goal) ──► trajectory ──► replay job ──► verified process
process-analyst/ba job ──► rules, requirements (draft) ──► [human confirm]
qa job ──► specs ──► lint job ──► run job ──► results ──► triage job

Every arrow is a row in the jobs table with a type, payload, budget, lease and retry count. Agents are workers pulling jobs, and promotion between statuses is done by deterministic code in the orchestrator, never by the agent claiming success.

Build order for the technical core
fingerprint package with fixtures and unit tests (the riskiest piece).
core schemas and SQLite migrations.
safety classifier with a labeled test set of action descriptors.
crawler on your demo app, rendering the graph to Mermaid for eyeballing.
mcp-server with three tools (get_known_states, record_step, submit_process).
Replay verifier.
Everything downstream (docs, testgen, runner).

I can write out the fingerprint function next (canonicalization rules, masking regexes, shingle hashing, and the cluster threshold logic), or draft the Zod schemas for the agent output contracts.

Claude works directly with your codebase