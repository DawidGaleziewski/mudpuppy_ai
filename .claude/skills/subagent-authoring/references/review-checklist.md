# Review checklist

Score each dimension **pass / warn / fail** and quote the line that justifies it. Run
`scripts/lint_agent.py` first; its output covers the mechanical items marked (L).

| # | Dimension | Pass when |
| --- | --- | --- |
| 1 | Justification | Isolation, parallelism, tool restriction, model or memory genuinely needed; otherwise should be a skill/rule/hook |
| 2 | One job | Describable as "<verb> <object>, return <shape>" without a second "and"; no overlap with sibling agents, or the boundary is stated |
| 3 | Description (L) | ≤~50 words, what + when + not-for, no examples, distinguishes from siblings |
| 4 | Body size (L) | ≤250 words typical; >400 fail unless every paragraph is needed on every run |
| 5 | No duplication (L) | Nothing restated from CLAUDE.md / constitution / spec files the agent loads or can read; pointers instead |
| 6 | Progressive disclosure | Sometimes-needed detail sits in a skill/reference with a *when* trigger; `skills:` only preloads small essentials |
| 7 | Tools (L) | Explicit minimum; Skill present if it loads skills; no web/write tools without a use; `Agent` absent unless delegating |
| 8 | Model/effort | Matches difficulty; not `opus` for a scan, not `haiku` for subtle review |
| 9 | Return contract | Final message shape and size specified; open questions returned, not asked |
| 10 | Rules quality | Each rule has a reason; mechanical rules are hooks/permissions/tests, not prose; few all-caps MUSTs |
| 11 | Context handling | Doesn't assume conversation history; names the files/sections it must read first |
| 12 | Freshness (L) | Referenced paths, skills and sections exist; frontmatter fields valid for the target version |

## Severity

- **Fail**: wrong mechanism, multiple jobs, description that misroutes, missing return contract, broken
  pointers, unsafe `permissionMode`, tool list that makes the agent's own instructions impossible
  (e.g. tells it to invoke a skill but omits `Skill`).
- **Warn**: oversize body, duplicated text, examples in description, generic persona, over-broad tools.
- **Note**: style, ordering.

## Bloat triage (for refactors)

List each paragraph/section with one label:
- **keep** — needed every run: role, procedure, hard rules + reasons, return contract.
- **move** — sometimes needed: target a skill or reference file, name the trigger.
- **delete** — already loaded via CLAUDE.md, restates a spec file, or generic advice.
Then compute the new body word count and confirm ≤ target.

## Report format

```
Verdict: <keep / refactor / split / replace with skill|hook>   (one line why)
Metrics: body <n> words · description <n> words · duplicated 8-grams <n> · tools <list>
Findings (most severe first):
- [fail|warn|note] <dimension> — "<quoted line>" → <specific fix>
Refactor plan:
- keep: …  - move → <target>: …  - delete: …
Proposed agents (if split): <name> — <one-sentence job>; tools; model
Open questions: …
```
