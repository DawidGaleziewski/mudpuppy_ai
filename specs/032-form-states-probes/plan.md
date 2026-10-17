# Plan 032: Every state of a form (R-69 (1)–(3))

Spec: `spec.md`. Research and spike: `research.md`. Data model: `data-model.md`. Tasks: `tasks.md`.

## Where things are today (read 2026-10-16)

- **State identity.** `fingerprint/src/fingerprint.ts`: level 1 = sha256(route template + canonical
  ARIA text + overlays) is the state; level 2 (MinHash, threshold 0.9) is the cluster. A **screen**
  is (portal, route template, cluster) and each state is a **revision** of it (`states.screen_id`,
  `screen_rev`, spec 022). The canonical text keeps texts and names, so a validation message shown in
  the DOM, and every value typed, gives a new level-1 state. That state usually stays in the same
  cluster, so it shows as a later revision of the same screen. Browser-native messages are not in
  the ARIA tree at all, so the state does not change.
- **Same-URL steps.** `act` reaches an action's state with `goto(page_url)` (`reachState`). On a
  same-URL wizard that lands on step 1, so a step-2 item queued earlier is `unreachable`.
- **Test data.** The persona already has `trace_inputs` (label → synthetic value), used by
  autofill in map mode (`autofillBeforeSubmit`) and by `inputValue`.
- **Traces.** `config/src/traces.ts` (`TraceVariant.expect`: `proceed` | `validation_error`) and
  `mcp-server/src/trace-driver.ts` (`driveVariant`) drive one run per variant through the tools.
- **Proposals for a person.** `grouping_suggestions` (spec 031) is the pattern: a server-written
  open row, which a person accepts in the dashboard through the chat service. The dashboard never
  writes. The Review inbox (`queries_review.KINDS`) lists every kind of decision.
- **Scars.** `apps/scar-maker` (SC-01…SC-18) with gate cases in `gates/tests/scars-*.test.ts`.
  SC-18 is a wizard over three URLs with server-side validation.

## Decisions (Claude, 2026-10-16; listed for the owner in `session_dump/`)

1. **Test data = `trace_inputs`.** *Superseded 2026-10-17: the owner chose one name, so
   `trace_inputs` is renamed `test_data` everywhere (schema, code, persona files, mixins
   `*-test-data.yaml`); a persona with the old key is refused with a rename note.* Original
   decision: O-M3 says "the persona's test data". The persona already has
   exactly that, under `trace_inputs`. This feature adds the alias `test_data` to the persona
   schema (the loader merges the two; `test_data` wins on the same label) and the dashboard calls
   it "Test data". Existing persona files keep working.
2. **One probe tool per form step: `probe_form`.** The crawler agent calls it once on a form step
   it has reached on the happy path, naming the step's submit or advance action. Optionally it
   passes the probe groups or probe ids to try. The server lists the probes that apply (from the
   catalogue and the fields on the page), runs them within the budget, records each outcome and
   returns a compact summary. The agent still chooses where and what to probe (it stays one
   non-deterministic agent). Each probe is executed and classified deterministically, and probing
   costs one turn per step, not one per probe (R-24).
3. **The probe catalogue is its own package `@pathfinder/probes`** (features layer, next to
   `fix-plugins`). `defineProbe({ id, group, summary, scars, appliesTo(field|form), plan(base) })`
   returns the inputs to type and an optional fault. It is pure, with no browser code, and unit
   tested per probe. The browser part (filling, faults, observing) lives in
   `mcp-server/src/runtime/pipeline/probe.ts`.
4. **Back to the step within the run.** Each state reached in a run keeps its path in memory
   (`RunState.pathTo`): the URL of the last `navigate` plus the acted steps (action, value) after it.
   `returnToState` opens the URL, redoes the steps through the same locate/perform code, and checks
   that the browser is back on the step (same form step key); otherwise it reports `REPLAY_DIVERGED`.
   `probe_form` uses it between probes. `act`'s `reachState` uses it too, when `goto` lands on
   another step of the same URL. That is a narrow, in-run form of R-66. Cross-run checkpoints,
   resume and retry stay in R-66.
5. **Form step identity (spike result, `research.md`).** A `FormStepIndex` in `fingerprint` (pure)
   assigns a state to a form step of its route template:
   - the same non-empty form name joins that step;
   - otherwise, a control set (role and name of the form controls, ignoring values and texts) that
     overlaps an existing step's by a Jaccard ≥ 0.5 joins it;
   - otherwise the state starts the next step number.

   Steps live in `form_steps` (with their control sets), so numbering holds across runs. The state
   fingerprint and the screens do not change, so existing stores keep their states.
6. **State kind.** `states.state_kind`: `main` (default) | `validation` | `technical`.
   `validation` is set when a form step state shows error signals: alert text, `aria-invalid`
   fields, or a text the probe read as a field message. `technical` is set when a state was first
   reached by a technical probe. `temporary` and `blocked` are outcome kinds, not state kinds (no
   state exists, or the state is the environment's fault).
7. **Outcome classification** (deterministic, `probes/src/classify.ts`, unit tested):
   - `blocked`: the gate refused, or a captcha or one-time code was seen; the probe stops there,
     without the CAPTCHA hand-off (O-M2).
   - `technical`: every outcome of a technical probe, including "no visible reaction".
   - `validation`: the browser is still on the same form step and there are field messages (DOM or
     native).
   - `branch`: a branch probe whose result differs from the happy result of that step (another step
     key or route, or other visible fields); a new screen is flagged `possible_new_process`.
   - `temporary`: a non-technical probe that ended on an HTTP 5xx or an error page.
   - `next`: otherwise. A validation probe that is accepted gets `accepted: true`, a finding for the
     BA.
8. **Technical faults** use Playwright routing on the step's page:
   - `block_request`: abort;
   - `http_500`: fulfil locally;
   - `delay`: hold the request 30 s, observe while it is pending, then let it go;
   - `offline`: context offline at the click, restored after observing.

   The fault hits the first document, XHR or fetch request the submit sends to the portal's own
   origin. Static files pass. Technical probes are gated like the submit itself (O-M1: wherever the
   action limit allows submitting, production included).
9. **Budget**: `probes: { per_step: 12, per_run: 60 }` in the portal file (Zod defaults). A
   `per_run` of 0 turns probing off. Skipped probes are listed in the tool result and in the run's
   coverage.
10. **Persisted structure (db-admin):** `form_steps`, `states.form_step_id`, `states.state_kind`,
    `probe_outcomes`, `probe_suites`. See `data-model.md`.
11. **The suite (US3).** The BA reads `probe_outcomes` through `get_run_evidence` (each with its
    path as label steps, and its fault). It calls a new BA tool `propose_probe_suite` with one trace
    entry per form (`traces.yaml` shape) whose variants carry `probe`, `expect` and `why`. The
    server validates it with the `TraceSpecEntry` schema and stores it as `probe_suites` (status
    `open`). Review gets the kind "Probe suites to approve". The owner keeps or drops each variant
    and may change its expected outcome, then approves or dismisses. Approving goes through the
    chat service (`POST /portals/{p}/probe-suites/{id}/approve`), which writes the trace into
    `portals/<p>/traces.yaml` with the `yaml` Document API (comments kept). An entry with the same
    id is replaced and the old one is kept in the suite row. The suite row is marked `approved`.
    Adding variants or editing steps happens in `traces.yaml` or through the chat. An unapproved
    suite cannot run: the trace driver reads only `traces.yaml`.
12. **Traces learn faults and outcomes.** `TraceVariant` gets `fault`
    (`block_request` | `http_500` | `delay` | `offline`) and `expect` gets `technical_error` and
    `branch`. `act` gets an optional `fault` input (trace mode only), which applies the same browser
    fault to that action. `driveVariant` passes it on the submit (or on the last step, when there is
    no submit).
13. **Documentation (US4).** `get_run_evidence` returns `probe_outcomes`. The `ba-practice` skill and
    the BA agent definition say how outcomes become inferred candidates (validation → business
    rule, branch → process variant, technical → NFR / error handling, all citing the outcome
    evidence). They also say that an error-only step is never documented as the step (design §7.5
    rule 3).
14. **Missing test data (O-M3).** When the happy baseline of a step fails validation on a field with
    no `trace_inputs` / `test_data` value, `probe_form` stops that step and returns
    `missing_test_data: [labels]`. The chat service's crawler prompt asks the BA once per label and
    saves the value with the existing `save_persona` path.
15. **Dashboard.** Before any UI task, refresh the skill: copy the package's
    `skill/mudpuppy-salvage-ui` over `.claude/skills/mudpuppy-salvage-ui`. Review lists the suites
    (FR-009). The screen page shows "States of this step": step number, kind, and the probe
    outcomes with evidence (a cut of screen 13). No graph (R-69 (5)).
16. **New scar SC-19** (`apps/scar-maker/src/scars/sc19-*.ts`): a three-step wizard rendered by
    script on one URL (`/sc19/apply`):
    - step 1 has browser-native required, `type=email`, `pattern` and `maxlength` fields;
    - step 2 has a radio "Customer type" where "Business" shows other fields and leads to a
      different step 3 (the branch);
    - step 2's Next posts JSON to `/sc19/api/quote` (the request technical probes break), and its
      errors are rendered in the DOM by script;
    - a "Confirm with code" step after Business shows a one-time-code field (blocked).

    Gates: SC-19 (steps and kinds), SC-19-probes (outcome kinds, budget), SC-19-limit (read-only
    limit: no probes), SC-19-suite (an approved suite runs twice with the same outcomes).

## Layers and guidelines

- `fingerprint` (kernel) gets `formStepKey` and `errorSignals` on the canonical ARIA, pure (G-08).
- `@pathfinder/probes` (features) depends on `config` and `core` only. The catalogue holds no client
  data; portal values come from the persona and the portal file.
- `config`: `probes` budget in the portal schema, the `test_data` alias, and the trace variant
  `fault` / `expect` values.
- `mcp-server`:
  - the tool shape goes in `tools/index.ts`, the logic in `services/probe-form.ts` (G-14);
  - the browser part is `runtime/pipeline/probe.ts` plus `runtime/pipeline/replay.ts`, as pipeline
    steps with reports (G-18);
  - new phase names go in store `PHASE_NAMES`;
  - the pipeline golden snapshot changes only where `act` reaches a same-URL step;
  - `propose_probe_suite` goes in `ba-tools`, with its service in `services/ba/probe-suites.ts`.
- `chat`: an approve/dismiss route and service (`probe-suites.ts`), and the traces writer.
- `dashboard`: `queries_review` kind `suites`, a review fragment, and a section on the screen page.
  Routers stay thin (G-13, G-15).
- Tests: unit tests for the catalogue, classifier, step key and budget (fast); the SC-19 gates (slow).
  Every file under 400 lines (G-01).

## Verification

Fast tier on every commit (CLAUDE.md). The slow tier before every commit that touches
`runtime/**`, `gates/**` or `crawler/src/**`. Close-out: the full `pnpm test` in `apps/crawler`,
every app's suite, the code-reviewer agent, the glossary, the changelog. Merging waits for the
owner's answers (`session_dump/`).
