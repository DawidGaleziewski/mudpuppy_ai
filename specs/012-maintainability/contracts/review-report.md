# Contract: `code-reviewer` subagent

**Invocation**: in the feature close-out (CLAUDE.md feature workflow, before the changelog and
merge): "review the branch `<branch>` against `master`". Tools: Read, Grep, Glob, Bash (`git diff`,
`git log`, lint and test commands), Edit (behaviour-neutral fixes only). Skill: `refactor-code`.

**Scope**: only files changed on the branch (`git diff master...HEAD`), judged against
`docs/code-guidelines.md`, the package's `CLAUDE.md` and lint output. It does not hunt bugs (the
built-in `/code-review` does that) and does not change behaviour.

**Output** (returned as its final message, and appended to the spec's `findings.md` under
"Close-out review"):

```markdown
## Close-out review: <branch> (<date>)

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | packages/x/src/y.ts:120 | G-03 | function 140 lines (limit 80) | extract `buildZ` | small | fixed |
| 2 | apps/dashboard/…/chat.py:40 | G-11 | route imports a query module of another page | move helper to deps.py | large | deferred → follow-up |

Checks after fixes: typecheck ✓ lint ✓ test:fast ✓ (test:slow ✓ if runtime touched)
Summary: <n> findings, <n> fixed, <n> deferred, <n> rejected.
```

Rules: every finding names a guideline id; `small` fixes are done one per commit-ready change with
the fast tier green; anything that would change behaviour, touch more than one file's public API
or take longer than a short session is `large` and deferred; rejected findings carry a reason.
