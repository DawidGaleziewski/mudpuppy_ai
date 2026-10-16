# Spec 030: battle-tested scars (R-56 … R-63, then R-64 … R-66)

Roadmap: the `[battle-tested-scar]` category (owner, 2026-10-15). Source: the anonymised field pack
`user_input/mudpuppy-ground-challenge.zip` (ids `C-*`, `H-*`, `GC-*`, `SQ-*`, `D-*`). Owner decisions
of 2026-10-15 are in `roadmap.md` (R-56, R-61, R-62) and `docs/discussions/r62-transit-zones.md`.
Built on one branch, `feature/030-r56-battle-tested-scars`, overnight, by the owner's request
("pick all the roadmap items … one branch … if any issues happen move them to the end; prioritise
the scar ones").

## Goal

Every failure seen at the customer site is reproduced in a local portal (**scar-maker**) and proven
fixed by a gate; portal-specific fixes become reusable, tested **fix-plugins**; the harness never
runs on an undeclared or defaulted environment.

## Functional requirements

### R-56 scar-maker

- **FR-001** A dependency-free Node app `apps/scar-maker/` serves one route per scar. It listens on
  two loopback addresses (`127.0.0.1` = the portal host, `127.0.0.2` = a second host for the identity
  provider / CDN), so cross-host behaviour is real without DNS changes. Dev port 4300, gate port 4400.
  (Deviation from the roadmap's `*.scar.test` names: loopback addresses need no Chromium host rules.)
- **FR-002** `apps/scar-maker/scars.yaml` catalogues every scar: `id` (`SC-nn`), `title`, `source`
  (field ids), `route`, `before` (symptom), `after` (expected), `status` (`gap` | `gate`).
- **FR-003** Gate ids accept `SC-nn`; the gate global setup also starts scar-maker on the gate port;
  the gate report lists scars without a case as uncovered.
- **FR-004** Scars are also an eval task (owner): a `scar-maker` task in `apps/crawler/evals/` with a
  YAML ground truth (G-34) of the screens the crawler must reach despite the scars.

### R-57 clicks and classification

- **FR-010** (C-2) An `a`/`area` element never inherits its enclosing form's method or action; an
  anchor counts as positive read evidence.
- **FR-011** (C-1) HTTP 403/429 stops the run only for the main-frame document; a sub-resource or XHR
  403/429 is recorded as a warning.
- **FR-012** (C-7) No URL parse throws on a `javascript:`, `mailto:`, `tel:` or relative href.
- **FR-013** (C-5) `select` acts fall back from option value to visible label.
- **FR-014** (GC-14) The action-rule keywords are per locale (`pl`, `en`, `de`); a portal may set
  `locales:` (default `[pl, en]`… plus `de` built in); a German "Senden" is a submit.
- **FR-015** (C-3/C-4) Anchor tiles are located by exact text first when the name is unambiguous;
  role-less tiles get a longer actionability budget.

### R-58 frontier never wedges

- **FR-020** An item that cannot be acted on (gone, hidden, `javascript:window.open`) is retired with a
  reason and never handed out again.
- **FR-021** `finish_run` completes when only retired items remain, listing them as the remainder.
- **FR-022** Visibility is re-checked when an item is handed out.

### R-59 fix-plugins

- **FR-030** A package `@pathfinder/fix-plugins` holds fixes as functions with an id, the scars they
  fix, a Zod parameter schema and the hooks they return.
- **FR-031** A portal turns fixes on in `portal.yaml` (`fixes: [{ use, with }]`); fixes run in order at
  their hook points and are traced as `fix:<id>`.
- **FR-032** First plugins: `seed-cookie`, `expand-collapsed`, `wait-for-mount`, `detect-stack`.
- **FR-033** A hook's `inPage` uses the crawler's `__name` shim.

### R-60 evidence when ready

- **FR-040** One condition wait (condition, quiet limit, hard limit; progress = requests finishing,
  URL change, DOM growth) shared by navigate/act/login.
- **FR-041** A failed stylesheet or script on a state is recorded as a render warning.
- **FR-042** A late error text on a login page is waited for and classified as transient.

### Owner additions (2026-10-15, mid-run)

- **FR-043** (SC-17) Intermittent error pages: a page whose main document answers 5xx, or a short
  page that only says a technical error happened (built-in phrases in EN/DE/PL plus the portal's
  own), is re-opened with GET (at most twice, honouring a short `Retry-After`) before it is
  observed; a `transient_error` event records each attempt and whether it recovered. An error page
  never becomes a screen in place of the real one, so the BA documents the real screens.
- **FR-044** (SC-18) A multi-step form with several validators per step, a Next/Submit button
  disabled until the step is valid, Back, and a final submit leading to a success or an error page:
  a trace records each validation message as an observed state, passes every validator, goes back
  and forward, and reaches the success page (and the error page on the error path).

### R-61 environments

- **FR-050** No default environment: an MCP server without `PATHFINDER_ENV` refuses to start, naming
  the declared environments.
- **FR-051** Environments are free names declared per portal in YAML; the store refuses an undeclared
  name; eval workspaces are admitted by prefix.
- **FR-052** Every MCP result carries the environment.

### R-62 login

- **FR-060** (C-6) Login fills dispatch input/change and blur.
- **FR-061** Login uses the condition wait.
- **FR-062** `pending` login result: one silent re-check, then returned to the agent, who may log in
  again.
- **FR-063** Static files have their own rate budget (`rate_limit.static_per_second`, default 20).

### R-63 network

- **FR-070** `network.proxy { server, bypass }` is honoured by the browser and the request gate.
- **FR-071** A `doctor` command with a registry of checks.

## Success criteria

- **SC-001** Every scar in `scars.yaml` has a gate or gap case; each fixed scar is a `gate()`.
- **SC-002** The fast and slow tiers stay green; the R-28 gates stay green.
- **SC-003** The scar-maker eval task runs and has a baseline.
