# Token usage analysis: R-20/R-21 build and validation (2026-10-04)

**Verdict.** Screenshots and wireframes cost almost no tokens. The cost has three causes, from
largest to smallest:

1. The build session ran in one context that grew to 680k tokens.
2. The crawler agent's frontier repeats every header and footer link on every page.
3. A few of my orchestration slips.

Making screenshots or wireframes opt-in would save well under 1%.

## Method

Every number below comes from the session transcripts in
`~/.claude/projects/-home-dawid-projects-pathfinder-ai/`:

- `dce4bb8c…` built the feature (spec through T042).
- `497b622a…` is this validation session, with three subagents under `…/subagents/`.

For every API call I summed the `usage` block, counting each message id once. I attributed the
size of each tool result to the tool that produced it, and split the largest results by JSON
field. The script is `usage.py` in the session scratchpad.

Each API call re-sends the whole conversation so far. Most of it is served from the prompt cache
(`cache_read`), which is cheap per token but is paid on every call. A context that grows by a
fixed amount per call therefore costs roughly quadratically: (number of calls)² × (growth per
call) / 2.

## Raw numbers

| Transcript | Model | API calls | Context: start → max | Cache read | Cache write | Output |
|---|---|---:|---|---:|---:|---:|
| Build session (spec through T042) | Opus | 370 | 39k → **680k** | **136.4M** | 1.49M | 323k |
| Crawler, map run 2 | Sonnet | 327 | 8k → **486k** | **78.1M** | 0.97M | 8k |
| BA session | Opus | 66 | 14k → 342k | 13.8M | 0.62M | 2k |
| This session (main) | Opus | 102 | 40k → 158k | 9.7M | 0.25M | 43k |
| Crawler, map run 1 (stalled on F-10) | Sonnet | 60 | 7k → 99k | 2.9M | 0.10M | 1k |

**Weighted estimate.** I converted everything to "input-equivalent" tokens using API price ratios:

- cache read = 0.1×
- cache write (1-hour) = 2×
- output = 5×
- Sonnet ≈ 0.6× Opus

On that basis the shares are roughly:

| Transcript | Share |
|---|---:|
| Build session | ~63% |
| Crawler run 2 | ~20% |
| BA session | ~9% |
| Main session | ~6% |
| Crawler run 1 | ~1% |

This is an approximation. I don't know exactly how plan limits weight cache reads against other
tokens, but the ranking is the same under any reasonable weighting.

## What R-20/R-21 itself costs in tokens

| Feature part | Token cost | Why |
|---|---|---|
| Screenshot capture (PNG, 21 per run) | **0** | Written to `data/evidence/` on the server. Tools return only a ref or `screenshot: true`. |
| Layout capture (element boxes) | **0** for the crawler | Stored as JSON evidence. The `act` and `navigate` results are unchanged on this branch (`git diff master...HEAD` touches no crawler result shape). |
| Wireframes (SVG + Excalidraw) | **0** | Drawn on the server from the layout. No model ever reads them. |
| `docs:export` images | **0** | Deterministic script. |
| BA `get_evidence` → new `elements` list | **~14k tokens written, ~0.8M re-read** | 44% of each `get_evidence` result (48k of 109k chars over 21 calls). About 6% of the BA session's cache reads and **~0.4% of the day**. |
| Viewing PNGs in a chat (my spot checks) | ~1.5k tokens per image | 3 images in this session. Only happens when someone looks at one. |

The capture costs time and disk, not tokens:

| Item | Size |
|---|---|
| Capture time per page | ~38 ms |
| Screenshots (21 PNGs) | 1.1 MB |
| Wireframes | 1.2 MB (SVG + Excalidraw) |
| Export `images/` folder | 4.6 MB |

**So there is no token-based reason to make screenshots or wireframes opt-in.** The one feature
cost worth trimming is the `elements` list (see P3).

## Cause 1: one long context for the whole build (~63%)

- **What happened.** The build session did spec, plan, tasks, analyze, all 43 tasks and four
  rounds of checks in one conversation. It had 370 calls and 676 tool calls, and it never
  compacted. By the median call the context was 385k, and by the end it was 680k. Every one of
  those calls re-read everything that came before.
- **What filled the context:**
  - Bash results, mostly test and lint output: ~491k chars, ~123k tokens.
  - 289 Edits and 48 Writes. Their inputs (the code) account for most of the 323k output tokens.
  - 20 file Reads: ~72k chars.
- **What a split would save.** The commits per task group (T001–T008, T009–T016, …) are natural
  cut points, and the session-dump workflow already exists for picking up after a cut. Starting
  each group fresh at ~40k context plus the spec would keep the average context near 150k instead
  of 385k: **roughly 55–60% less cache read for the same work**.
- **Skills.** The four speckit skills (`specify`, `plan`, `tasks`, `analyze`) were the right ones,
  and their own cost is small. No skill was used wrongly. The issue is that everything stayed in
  one context, not which tools were used.

## Cause 2: the crawler re-walks the shared navigation (~20%, Sonnet)

- **What happened.** For 21 pages the frontier held 354 items. The agent executed 319 `act`
  calls, and each result lists every action on the target page: about 17, ~2.6k chars, ~1k
  tokens with the UUIDs. Over 327 calls that made the context grow to 486k, and the run re-read
  78M cached tokens.
- **Where the size comes from:**
  - 96% of each `act` result is the `actions` array. Most of it is the same 12 header and footer
    links on every page.
  - 283 of the 302 `act` results (94% of the chars) landed on a page that was already known, so
    their action lists told the agent nothing new.
  - The 319 executed items had only **13 distinct link targets**, plus 19 non-link controls.
    About **32 distinct things to do** were spread over 319 calls.
- **Is it the feature?** No. This is how the frontier has worked since R-04 and R-16. R-20 made
  it show up because validation required a full, honestly finished run (F-08, F-10).

## Cause 3: my orchestration slips in this session (~2–3%)

| Slip | Cost |
|---|---|
| Map run 1 was thrown away (F-10, the stuck navigate item) | ~3M cache read (Sonnet) |
| I told the crawler to skip the login, which needed two extra resumes | Each resume re-loaded the crawler's 486k context to make one call that was then denied: **~1M cache read for nothing** |
| I worked the last 16 frontier items myself in the main session | ~43k chars of `act` results added to my context, re-read by every later call |

**What I should have done:**

- After the first denial, pressed the login from the main session straight away, instead of
  resuming the crawler.
- Never resumed a subagent with a near-full context for a one-call job. A fresh agent, or the
  main session, starts at ~8k.

**Things that were fine:**

- Background subagents kept the 78M-token crawl and the 14M-token BA session out of the main
  context. That's why this session peaked at 158k.
- `tail`/`grep` on test output kept the Bash results small here: ~1k chars per call on average.

## Recommendations

Following CLAUDE.md, these are proposals only. Nothing below is implemented.

### Workflow (biggest lever, no code)

- **W1. One context per task group.** After each committed task group, `/clear` or start a new
  session from the spec, `tasks.md` and the latest session dump. Expected saving on a build like
  R-20/21: ~55–60%. The memory note `model-split-per-task` already splits work by model; this
  splits it by context too.
- **W2. Run long jobs in subagents, and never resume a fat one for a small step.** A small step
  goes to the main session or to a fresh agent.
- **W3. Keep test output to a line.** Use `pnpm test 2>&1 | grep -E "Test Files|Tests |FAIL"`
  (already the habit) and `pytest -q | tail -1`. Read the full log only when something fails.

### Product: crawler (big saving per map run; not R-20 scope)

- **P1. Slim `act`/`navigate` result for a known state.** When `created: false`, return only
  `state_id`, `title`, `route_template` and `edge_id`, with no `actions` list. The agent works
  from `get_next_frontier_item` anyway. That cuts 94% of the result chars in this run. Estimated
  effect: the context stays under ~60k, and cache reads fall from ~78M to roughly 5M.
- **P2. Dedupe the frontier by target.** Queue one item per resolved `href` (plus each
  non-link control), and record the other edges as inferred instead of clicking them. Here that
  would mean 319 → ~32 executed items: a ~90% cut in calls and run time, on top of P1.
  - Trade-off: edges from the shared navigation would be "inferred", not "observed". This keeps
    the crawler a single LLM agent (CLAUDE.md domain fact). It only stops the agent from
    clicking the same menu 21 times.
  - P1 and P2 together would make a map run cost about as much as one BA pass.

### Product: BA (small saving; R-20 scope)

- **P3. Compact the `elements` list in `get_evidence`.** The `role` and `name` fields repeat
  what `key` already says, and `box: true` appears on almost every entry. Returning `keys: [...]`
  plus `no_box: [...]` would roughly halve it. An alternative is an `include_elements` flag that
  the BA sets only in the screen-region pass. Saving: ~0.2% of the day. It's worth doing because
  it's simple, but it's not urgent.
- **P4. Page size of `get_run_evidence`.** This is the BA's biggest result: 27 calls, 306k
  chars, 37% of all its tool-result chars. It is not R-20; consider leaner page items.

### What not to make opt-in

- **Screenshots, layout capture and wireframes.** They cost 0 model tokens, and the BA's
  `screen_region` citations and the dashboard outlines depend on the layout. An opt-in flag
  would add a mode to test and keep working, for no token saving.
- If disk or run time ever matters (production portals with thousands of pages), a portal-level
  `wireframes: false` setting would be the right shape. `pnpm wireframes:build` can already
  redraw wireframes later from the stored layout, so making them on request is already possible.

## Summary

- **Is the feature the problem?** No. It accounts for ~0.4% of the day's tokens, all of it in
  the BA's `elements` field.
- **Is it how the context was managed?** Mostly, yes: one 680k-token build session is ~63%.
- **The second big cost** is an old crawler design issue (shared navigation walked page by
  page), which only became visible now that runs must finish properly.
