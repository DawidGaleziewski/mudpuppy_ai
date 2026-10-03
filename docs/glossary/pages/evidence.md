# Evidence, explained

Evidence is what the crawler saved as proof of what it saw. Pathfinder's first rule is that no
documentation statement exists without it: every BA record cites at least one piece of evidence,
and every piece of evidence belongs to a run. Back to the
[glossary entry](../README.md#evidence).

## What can be evidence

| Kind | What it contains | Where it is stored | Gathered by |
|---|---|---|---|
| **State snapshot** | A masked accessibility snapshot (ARIA) of the page: headings, landmarks, links, buttons and fields with their roles and names, as text. Plus the route template, title, fingerprint, cluster and stabilization result. | Snapshot file `data/evidence/<sha256>.yaml`; the state row in the database | Map and trace runs, every state |
| **Transition (edge)** | Which state an action started from and which it led to, whether it was executed or skipped, and any error. | Database (`edges`), with a snapshot reference | Map and trace runs |
| **Action** | Role, accessible name, ranked candidate locators, the link address if any, safety class, and whether it was allowed or why not. | Database (`actions`) | Map and trace runs, every action on every state |
| **Form** | Each field's name, type, whether it is required, constraints, options and validation messages. Forms are recorded, never submitted in map mode. | Database (`forms`) | Map and trace runs |
| **Network call shape** | Method, URL template, status code, and the structure of the request and response (field names and types, not values), plus console errors. | Database (`network_calls`) | Map and trace runs; only background `fetch`/XHR calls |
| **Frontier item and decision** | What was queued or skipped and the rule behind each skip, refusal, merge or split. | Database (`frontier`, `decision_log`) | Map runs mostly |
| **Open question / rule candidate** | Something the crawler could not explain, or a possible rule it spotted. | Database | Map and trace runs, when the agent flags one |
| **Process and steps** | A named process, its ordered steps (intent, kind, value, outcomes) and the final outcome. | Database (`processes`, `process_steps`) | Trace runs only |
| **robots.txt policy** | The fetched rules for the host, crawl delay and when it was fetched. | `data/evidence/<sha256>.json` and the database | Before the first request to a host |
| **Run trace** | The crawler's own machinery: tool calls, phases and timings. Debugging data, not portal facts. | Database (`trace_spans`); large payloads in `data/evidence/` | Every run |
| **Playwright trace** | A replayable recording of the browser, including screenshots. | `data/traces/<portal>/<run>/<seq>-<tool>.zip` | Sandbox only, never on production |

Everything under `data/` is generated and git-ignored. Each environment has its own database
file, `data/db/<environment>.sqlite`. Files in `data/evidence/` are named by the sha256 hash of
their masked content, so identical content is stored once and a file can never be changed
without its name changing.

## What is never gathered, and why

- **Personal data.** Before anything is written, a scrubber masks e-mail addresses, phone numbers,
  card numbers, tokens and names (for example as `[email]`). It runs on every snapshot and
  network shape.
- **Request and response bodies.** Only their structure is kept. The structure tells the BA what
  data a screen exchanges; the values could contain personal data and are not needed.
- **Screenshots on production.** Regex masking cannot clean an image, so screenshots exist only
  inside Playwright traces, and those are made only on a sandbox. The dashboard never serves them;
  you open them locally with `npx playwright show-trace <path>`.
- **Anything behind a submit on production.** Only read-only actions run there, so what a form
  does after submitting is unknown until traced on a sandbox. It appears as a gap, not a guess.
- **Anything the crawler cannot see from a browser**, such as back-office work, e-mails sent or
  scheduled jobs. These are flagged "not observable".

## How the BA uses it

The BA agent never browses. It reads evidence through its own read-only tools:

1. `list_runs` and `get_run_evidence` give it one kind of evidence at a time for a run (states,
   forms, network calls, actions, decisions), with ids and a short summary.
2. `get_evidence` returns one full item, including the content of its snapshot file (cut at
   60 kB).
3. `list_processes` and `get_process` give it traced processes step by step.

When it writes or revises a record, it attaches **evidence links**: each one names a
[target](../README.md#target) (a state, form, action, network call, process step, and so on) and
says what that target supports. In the Docs tab these are the **Cites** count and the evidence
table on the record page, where clicking a target opens it on its run page.

If the evidence is not enough, the BA does not guess: it writes a gap, an open question or a
[follow-up task](../README.md#follow-up-task) asking for another run.

## A real example

`DI-015 "Telefon"`, the phone field on the reference portal's contact form, cites four pieces of
evidence from two runs:

| Target | Run | What it supports |
|---|---|---|
| form | map | `telefon`: type tel, not required, pattern `\+?[0-9 ]{9,15}` |
| state | map | the snapshot shows a textbox named "Telefon" |
| form | trace | the validation message "Please match the requested format." |
| process step | trace | sending was blocked by the phone format |

The map run gave the field and its constraints; only the trace, which typed a wrong value and
pressed send on the sandbox, could show what the portal does with it. The related rule `BR-012`
"Contact form: required fields, lengths and formats" cites the same forms plus three trace steps.
