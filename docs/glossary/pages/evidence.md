# Evidence, explained

Evidence is what the crawler saved as proof of what it saw. Pathfinder's first rule is that no
documentation statement exists without it: every BA record cites at least one piece of evidence,
and every piece of evidence belongs to a run. Back to the
[glossary entry](../README.md#evidence).

## What can be evidence

| Kind | What it contains | Where it is stored | Gathered by |
|---|---|---|---|
| **State snapshot** | An accessibility snapshot (ARIA) of the page: headings, landmarks, links, buttons and fields with their roles and names, as text. Plus the route template, title, fingerprint, cluster and stabilization result. Masked only when the portal sets `pii_scrub`. | Snapshot file `data/evidence/<sha256>.yaml`; the state row in the database | Map and trace runs, every state |
| **Screenshot** | A full-page PNG of the state as first recorded, unmasked, cut at 10 000 px. | `data/evidence/<sha256>.png`, referenced by the state | Map and trace runs, every new state, every environment |
| **Layout** | Every [element key](../README.md#element-key) of the state with its position and size on the screenshot. | `data/evidence/<sha256>.json`, referenced by the state | With the screenshot |
| **Screen region** | Not a file: an evidence link naming a state and one element key, which the dashboard outlines on the screenshot. | Database (`doc_evidence_links`, `region`) | Written by the BA |
| **Wireframe** | A sketch of the state drawn from its snapshot, as SVG and as an editable `.excalidraw` file. Derived, not proof on its own. | `data/evidence/<sha256>.svg` / `.excalidraw`, `state_wireframes` | Every new state; `wireframes:build` redraws |
| **Transition** | Which state an action started from and which it led to, whether it was executed or skipped, and any error; since 2.0 also its journey step, element key and result. | Database (`transitions`), with a snapshot reference | Map and trace runs |
| **Observation** | One arrival on a page: the verbatim URL, the hops that led there, the step result and the builds it was served by. | Database (`observations`) | Map and trace runs, every page |
| **Action** | Role, accessible name, ranked candidate locators, the link address if any, safety class, and whether it was allowed or why not. | Database (`actions`) | Map and trace runs, every action on every state |
| **Form** | Each field's name, type, whether it is required, constraints, options and validation messages. Off production, map mode fills a form with test data before pressing its submit button ([form autofill](../README.md#form-autofill)). | Database (`forms`) | Map and trace runs |
| **Network call shape** | Method, URL template, status code, and the structure of the request and response (field names and types, not values), plus console errors. | Database (`network_calls`) | Map and trace runs; only background `fetch`/XHR calls |
| **Frontier item and decision** | What was queued or skipped and the rule behind each skip, refusal, merge or split. | Database (`frontier`, `decision_log`) | Map runs mostly |
| **Open question / rule candidate** | Something the crawler could not explain, or a possible rule it spotted. | Database | Map and trace runs, when the agent flags one |
| **Process and steps** | A named process, its ordered steps (intent, kind, value, outcomes) and the final outcome. | Database (`processes`, `process_steps`) | Trace runs only |
| **robots.txt policy** | The fetched rules for the host, crawl delay and when it was fetched. | `data/evidence/<sha256>.json` and the database | Before the first request to a host |
| **Run trace** | The crawler's own machinery: tool calls, phases and timings. Debugging data, not portal facts. | Database (`trace_spans`); large payloads in `data/evidence/` | Every run |
| **Playwright trace** | A replayable recording of the browser, including screenshots. | `data/traces/<portal>/<run>/<seq>-<tool>.zip` | Sandbox only, never on production |

Everything under `data/` is generated and git-ignored. Each environment has its own database
file, `data/db/<environment>.sqlite`. Files in `data/evidence/` are named by the sha256 hash of
their content, so identical content is stored once and a file can never be changed without its
name changing.

## What is never gathered, and why

- **Personal data, when the portal asks for it.** Since constitution 2.0.0 Pathfinder runs almost
  only against test portals with disposable data, so text evidence is stored as recorded. A
  portal config with `pii_scrub: true` turns the scrubber back on for snapshots, titles, form
  fields and network shapes (e-mail addresses, phone numbers, card numbers, tokens become
  `[email]` and so on). Screenshots are never masked.
- **Request and response bodies.** Only their structure is kept. The structure tells the BA what
  data a screen exchanges; the values are not needed.
- **Anything behind a submit on production.** Only read-only actions run there, so what a form
  does after submitting is unknown until mapped or traced on a sandbox. It appears as a gap, not
  a guess.
- **Anything the crawler cannot see from a browser**, such as back-office work, e-mails sent or
  scheduled jobs. These are flagged "not observable".

## How the BA uses it

The BA agent never browses. It reads evidence through its own read-only tools:

1. `list_runs` and `get_run_evidence` give it one kind of evidence at a time for a run (states,
   forms, network calls, actions, decisions), with ids and a short summary.
2. `get_evidence` returns one full item, including the content of its snapshot file (cut at
   60 kB). For a state it also lists the element keys and whether each has a box on the
   screenshot, so the BA can cite a screen region.
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
