# Phase 0 Research: Crawler Map Mode

All Technical Context fields were resolvable directly from the constitution
(`.specify/memory/constitution.md`) and `user_input/raw_idea/tech-stack.md`, so no
`NEEDS CLARIFICATION` markers remain. This document records the decisions that shape design,
not the stack choices already fixed by those two sources.

## 1. State identity (fingerprinting)

- **Decision**: Two-level fingerprint. Level 1 = `sha256(routeTemplate + canonicalARIATree +
  openOverlays)` for exact identity. Level 2 = a shingle set (role+name pairs or role paths)
  hashed with SimHash/MinHash, compared by Jaccard/Hamming distance; states whose Level 2
  similarity exceeds a configurable threshold (default 0.9) are assigned to the same cluster
  even if Level 1 differs.
- **Rationale**: Satisfies FR-009 (fingerprint of route template + normalized structure,
  volatile content masked, near-identical states grouped) and the edge case of listing pages
  that differ only by item content. Gives tunable granularity without recrawling.
- **Alternatives considered**: Content hash only (rejected — merges genuinely different
  states that share structure, e.g. two different forms); URL-only identity (rejected — false
  for SPA states and modals); embeddings-based similarity (rejected for v1 — non-deterministic,
  harder to unit-test against fixtures per Principle VII).

## 2. URL → route template inference

- **Decision**: Normalize per RFC 3986 (strip tracking params, sort remaining query params,
  drop fragments unless hash-routed), then insert observed paths into a trie. A segment
  position with high cardinality, or matching numeric/UUID/long-hash patterns, collapses to
  `:param`; low-cardinality segments stay literal.
- **Rationale**: Required for FR-001 (route templates) and FR-009 (fingerprint input); trie
  insertion is a pure, unit-testable operation against fixture URL lists.
- **Alternatives considered**: Regex allowlist per portal (rejected — doesn't generalize per
  FR-022's requirement that new portals need no crawler changes).

## 3. Page stability detection

- **Decision**: A state is "settled" when network is idle for a configurable window, a
  `MutationObserver` reports no DOM mutations for T ms, and no CSS animations are running, with
  a hard timeout after which the record is flagged `never_stabilized` rather than discarded.
- **Rationale**: Fixed timeouts produce phantom states and flaky graphs (per
  `user_input/raw_idea/agents/crawler.md`); the flag keeps every record covered by evidence
  even in the timeout case, preserving FR-003.
- **Alternatives considered**: Fixed `waitForTimeout` (rejected — explicitly banned for
  generated tests by the constitution's Technical Constraints, and equally unreliable here).

## 4. Action safety classification

- **Decision**: A rules engine scores each candidate action from role, label keywords (delete,
  pay, send, logout, bid, buy now, message/contact seller, show phone), the HTTP method of any
  triggered request, and form semantics; it returns the *most dangerous* class across signals
  (`read` / `mutating` / `destructive` / `external-side-effect`), and any signal conflict or
  unknown case resolves to unsafe. This runs as a pure `safety` package function, not an agent
  decision, and its output cannot be overridden by the agent.
- **Rationale**: FR-004 (classify in code outside the agent, ambiguous = unsafe) and Principle
  V. The portal-specific denylist entries from the spec's edge cases (bid, buy-now, payment,
  messaging, phone reveal, listing-creation path) are data the classifier consults, not
  special-cased logic, so a new portal only needs new denylist/keyword config.
- **Alternatives considered**: LLM-judged safety per action (rejected outright — Principle V
  requires the check to run "outside the agent's control", explicitly to survive a prompt
  telling the agent to ignore it).

## 5. Portal/persona config resolution (`extends`)

- **Decision**: Load the target persona file, resolve `extends` (persona-to-persona or
  persona-to-`_mixins`) by recursively loading each referenced file, detecting cycles via a
  visited-set walk, and merging in resolution order so later (closer to the target) entries
  override earlier ones, field by field. The effective safety ceiling is computed last as
  `min(portal.max_action_class, resolvedPersona.max_action_class)`, where the portal value
  defaults to `read` for `environment: production`. All inputs and the merged
  output are validated against the same Zod schema.
- **Rationale**: Directly implements FR-016, FR-017, FR-018 and User Story 3's acceptance
  scenarios (composition, restriction-only ceiling, inline-secret rejection, circular-`extends`
  rejection with a message naming the file).
- **Alternatives considered**: Deep-merge library with implicit array concatenation (rejected —
  ambiguous override semantics for scope/denylist arrays; explicit field-level override rules
  are easier to test and to explain in a rejection message).

## 6. Production rate limiting and identification

- **Decision**: A token-bucket limiter in the `crawler` package's session/executor layer,
  configured per portal (`requests_per_second`, `max_concurrency`), applied to every
  Playwright-triggered request while the environment guard is active; every production request
  carries a configured identifiable `User-Agent` (and optional custom header).
- **Rationale**: FR-006, SC-006/SC-007's "no further requests" guarantee after a block is
  detected (the limiter and the stop-on-block check share the same request-issuing choke
  point, so stopping there is sufficient).
- **Alternatives considered**: Per-action `sleep` calls scattered through the crawl loop
  (rejected — doesn't give a single enforcement point to verify or to halt on a block).

## 7. CAPTCHA / block detection

- **Decision**: A response/DOM classifier checked at the same choke point as the rate limiter:
  HTTP 403/429 patterns, known CAPTCHA vendor markers (iframe src patterns, challenge form
  fields), and configurable portal-specific block-page signatures. On a match, the run stops
  immediately, writes a run-level warning to the decision log, and issues no further requests.
- **Rationale**: FR-008, SC-007 (100% stop rate, no further requests). The spec's assumption
  that `marketsite.example` already returns a 403 bot-challenge confirms this needs to be a generic,
  configurable check, not a single hard-coded pattern.
- **Alternatives considered**: Manual/human-triggered stop only (rejected — Principle V
  requires this to be automatic and to survive the agent being instructed to bypass it).

## 8. Known obstacles (cookie banners, popups, chat widgets)

- **Decision**: Shared handlers in the `obstacles` package, registered via Playwright's
  `addLocatorHandler` (or equivalent) before a state is recorded, so obstacles are dismissed
  and never become false states. The guest persona's consent decisions (decline
  location/marketing/personalization) are expressed as obstacle-handler config on the persona,
  not hard-coded.
- **Rationale**: FR-019, FR-023, and the edge case explicitly calling out obstacle handling as
  a precondition to recording a state.
- **Alternatives considered**: Per-portal obstacle scripts (rejected — `obstacles` is shared
  with later QA tooling per the constitution's Technical Constraints; portal-specific
  selectors are supplied as data, not code).

## 9. Evidence storage and PII masking

- **Decision (amended)**: v1 stores NO screenshots: regex masking cannot redact pixels, so a
  screenshot could leak PII that FR-014 forbids persisting. Evidence is the masked ARIA snapshot
  and network shape records only; screenshots need a separate decision (DOM-level masking before
  capture, or access-restricted storage). Evidence (canonicalized ARIA snapshot, network/HAR record) is
  written to the filesystem under `evidence/<sha256>` and referenced from SQLite by that hash;
  PII (names, emails, phone numbers, tokens) is masked by regex/type before the evidence file
  is written or any record is persisted — masking happens before persistence, not after.
- **Rationale**: FR-014 ("before anything is persisted, including evidence files"), SC-004
  (zero unmasked PII in a sampled review).
- **Alternatives considered**: Mask-on-read (rejected — violates FR-014's "before anything is
  persisted" requirement and risks leaking PII if the masking step is ever skipped downstream).

## 10. Frontier scheduling and trap detection

- **Decision**: A priority queue keyed on depth (BFS by default) with novelty boosts for
  actions that previously led to new states; a sliding window over recent fingerprints/cluster
  ids stops expanding a branch after N consecutive same-cluster results, combined with hard
  per-template and total state caps.
- **Rationale**: FR-007 (scope/budget enforcement including per-template and total state caps)
  and the edge case covering infinite scroll/pagination/calendars/facets.
- **Alternatives considered**: Pure BFS with only a global state cap (rejected — doesn't stop
  a single infinite-state template, such as a calendar, from consuming the whole budget before
  other areas are explored).

## 11. Agent runtime and browser access

- **Decision**: The crawler agent is the Claude Code subagent `.claude/agents/crawler.md`,
  invoked from the main Claude Code session. Its frontmatter `tools:` lists only the
  `mcp__pathfinder__*` tools (omitting `tools:` would inherit Bash and everything else, so it is
  always explicit). The `pathfinder` stdio MCP server (`.mcp.json`) owns the only Playwright
  instance, the DB and the evidence store. The agent proposes navigation and `action_id`s; the
  server runs the environment guard, classifier, scope/denylist, rate limiter and block
  detector, executes, stabilizes, observes, fingerprints and records. The agent has no tool to
  write state/transition/form/API-call records and cannot choose raw selectors.
- **Rationale**: Principles III and V require the deterministic checks to be non-overridable
  by the agent. That holds only if the agent has no other path to the browser or network. The
  agent cannot be given Bash (`curl`, `npx playwright`) or a generic Playwright MCP.
  Server-side recording also means the agent cannot fabricate an `observed` fact
  (Principle II). The server owns the frontier so a long crawl is not bounded by the subagent's
  context; a fresh invocation resumes via `start_run { resume_run_id }`.
- **Consequences**: budgets, block-stop and the environment guard live in the server (there is
  no launcher CLI); the tool allowlist is configuration, so a test asserts the file's `tools:`
  list and the server is the real enforcement point. Subagents cannot spawn subagents.
- **Alternatives considered**: a Node process driving Playwright and calling an LLM API in a
  loop (rejected — the user's chosen runtime is Claude Code); giving the subagent Bash to run a
  crawler CLI (rejected — direct bypass path, and command allowlists are not enforcement);
  Microsoft's Playwright MCP (rejected — no guards).
