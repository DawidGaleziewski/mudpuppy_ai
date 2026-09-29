# Contract: `rationale` on crawler tools

Changes to `apps/crawler/packages/mcp-server/src/tools/index.ts` input shapes:

| Tool | New field |
| --- | --- |
| `navigate` | `rationale: z.string().trim().min(1).max(300)` — required |
| `act` | same |
| `finish_run` | same |

- Missing or invalid → the SDK's input validation error (reported to the agent like any schema
  error); the call span is still written with status `error`.
- The value is passed only to `Tracer.call` (`CallStart.rationale`), masked, stored on the span.
  Services, gates and recorded Layer A/B records never receive it (asserted by a test that the
  service functions' inputs do not contain `rationale`).
- Displayed as "agent-stated" (Principle I).
- `.claude/agents/crawler.md` procedure: "Every `navigate`, `act` and `finish_run` carries a
  one-sentence `rationale`: what you expect this step to reveal or why you stop." Lint with
  `subagent-authoring`.
- Existing tests calling these tools add a rationale; `agent-lockdown.test.ts` asserts the tool
  list is unchanged and `rationale` is required on the three tools.
