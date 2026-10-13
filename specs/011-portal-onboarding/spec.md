# Spec 011: Portal onboarding and portal switcher (R-31)

Status: done (T001–T022, phases 1–4), success criteria checked live 2026-10-07, signed off by
the BA 2026-10-07; squash-merged to master together with R-30 (tag v1.0.10), built on
`feature/011-r31-portal-onboarding` and `feature/012-r30-r31-integration`. Source: BA review 2026-10-06 (spec 010 findings F-22 item 4) and the BA's follow-up:
"I want to be able to add new portal from gui. Also I cannot see the dropdown to change selected
portal?"

## Problem

A BA can only work on portals a developer configured (`portals/<id>/portal.yaml`). Asked to scan
wikipedia.org, the chat could not; nothing in the dashboard lets the BA add a site or switch
between portals, and every page mixes all portals.

## User decisions (2026-10-06)

- New portals are added from the dashboard (a form), not by the assistant writing config.
- The sites are ones the BA works on and migrates: no read-only default, no robots.txt or terms
  gate, forms may be submitted. This is the BA's responsibility. Production stays read-only
  (constitution Principle V); a new portal is created for sandbox or staging.
- A portal dropdown sits next to the environment picker: configured and scanned portals, "all
  portals", and "+ new portal". The pages follow the chosen portal.

## Requirements

- **FR-001** The header shows a portal dropdown on every page: every configured portal and every
  portal with runs in the chosen environment, plus "all portals" and "+ new portal".
- **FR-002** The choice is kept while moving between pages (cookie), until changed.
- **FR-003** With a portal chosen: Overview lists only its runs; Docs opens its documentation;
  Chat opens the newest conversation of that portal, and [new conversation] starts one for it.
- **FR-004** "+ new portal" opens a form: address (URL), short name (proposed from the address),
  environment (sandbox or staging), robots.txt (ignore by default, or respect), how far the
  crawler may go (default: may submit forms). Saving writes `portals/<id>/portal.yaml` and a
  `guest` persona, both checked with the same loader a run uses, and opens a new chat
  conversation for the portal.
- **FR-005** The form refuses a name already in use, an address that is not http(s), and a
  config the loader rejects, saying why in plain words.
- **FR-006** A portal may set `robots: ignore`: no robots.txt is fetched and no link is refused
  because of it. Default `respect`, so existing portals do not change.
- **FR-007** The assistant, asked for a site that is not configured, points the BA to "+ new
  portal" in the portal dropdown instead of saying a developer must add a file.

## Success criteria

- **SC-001** From an empty dashboard, a BA adds wikipedia.org and starts a guest scan from the
  chat in under 3 minutes, without touching a file.
- **SC-002** Choosing a portal in the dropdown changes Overview, Docs and Chat to that portal
  on the next page load; "all portals" restores the mixed view.
- **SC-003** A portal with `robots: ignore` starts a run when its robots.txt is unreachable and
  visits robots-disallowed paths; a portal without the field behaves as before (gates green).

Checked 2026-10-07 (`findings.md`): SC-001 met (run started 16.6 s after the portal was added,
driven through the chat service API the form uses; the form itself was checked in a browser on
2026-10-06); SC-002 met (browser check 2026-10-06); SC-003 met (live, four throwaway portals).

## Phase 2: environments per portal (BA follow-up 2026-10-06 night)

Trigger: "document wikipedia" was refused: a public address "looks like production" and the
portal declared sandbox; the BA could not change it. The BA: "If i say production should be
scanned let it be production. Probably best to allow adding different envs for each portal on
start. And add something like portal settings where I can add and or revoke portals
environments."

Decisions (2026-10-06): production may submit forms (per environment, the BA chooses how far);
one portal holds several environments, each with its own address and limit.

- **FR-008** A portal file may hold `environments: {production|staging|sandbox: {base_url,
  max_action_class, allowed_domains?}}`. Loading a portal picks one environment; a file with
  only one environment needs no choice. Old single-environment files keep working.
- **FR-009** A scan names its environment. The chat asks when the portal has several; a run
  records it. Runs of every environment go into the chat service's store (no separate server
  or database per environment); test-user credentials are looked up for the run's environment.
- **FR-010** Production follows the portal's limit like any environment: forms may be filled
  and submitted, a login may be made. A CAPTCHA still stops a production run; Playwright traces
  stay off on production. No compliance gate (constitution 4.0.0). *(CAPTCHA and Playwright
  trace parts superseded by spec 021: hand-off and traces on every environment.)*
- **FR-011** The "+ new portal" form takes an address per environment (production, staging,
  sandbox; at least one) and the limit for each.
- **FR-012** A portal settings page lists its environments (address, limit), adds one and
  revokes one (never the last). Reached from the header when a portal is chosen.

## Phase 3: per-scan decisions and live-check fixes (BA answers 2026-10-07)

Trigger: the live checks of 2026-10-07 (`findings.md`). The BA's answers: "By default read only.
Chatbot asks if we want to do edit and form submits. If yes he just does it. No other
guardrails." / a stop the BA asked for is not a failure, "if it can be resumed from last point,
add option to resume" / "We need images for human to know what is needed. Add option to skip
images load … as decision when mapping. By default we do pictures … we add information where
picture has been that it was skipped and why." / fix F-06, F-07, F-08 and the spec 010 wording.

- **FR-013** Every scan from the chat is read-only unless the BA allows more for that scan.
  Before a new scan the assistant asks whether it may fill in and submit forms; a yes runs up to
  the environment's limit with no further warnings. `start_run` takes `max_action_class`, which
  lowers the run's limit and never raises it; the choice is kept with the run and a resume keeps
  it unless the BA changes it. The portal's limit stays the most any scan may do there.
- **FR-014** Images load by default. The BA may choose, per scan, to skip them for faster
  mapping; each image is then answered with an "Image skipped: images turned off for this scan"
  placeholder (visible in screenshots where the picture would be), without a network request or
  a rate-limit slot, and the run's decision log says once that and why images were skipped.
- **FR-015** A step whose run the BA stopped ([stop], [stop scan], or the assistant on request)
  is `stopped`, not failed, with no error reference; the tracker shows **[resume scan]**, which
  asks the assistant to resume the run from its queued pages with its own choices.
- **FR-016** `navigate` to an address that cannot be opened answers `NAVIGATION_FAILED` and
  records nothing (F-06); a run that ended without recording a page says the address may be
  wrong or the site down, not "resume it" (F-07); the assistant writes only what is meant for
  the BA (F-08).

## Phase 4: focused scans and process traces from the chat (BA request 2026-10-07)

Trigger: "can you scan wikipedia now? only go for english route and only map searching for a
pickle" got "the only scan I can run is to continue the stopped one … I'd save a new persona"
(F-09). The BA: "I should be able to focus it on some paths and i.e. exclude some for time
being." Decisions: the focus is per scan, said in the chat (not saved on the portal); when a scan
is stopped and the BA asks for a scan, the assistant asks "resume or new".

- **FR-017** A scan may carry a focus: a start page, hosts and path globs to stay within, path
  globs to leave out. It only narrows the portal's scope (a host or path outside it, or a start
  page outside the focus, refuses the run before anything is written); the gate refuses
  excluded paths (`scope:excluded_path`) for `navigate`, clicks and browser navigations alike.
  The focus is kept with the run; a resume keeps it unless the BA gives a new one. No persona is
  made to limit a scan.
- **FR-018** A portal that was scanned may get a new scan (the `scan` move stays valid; it is
  not proposed unless the BA asks). With a stopped scan the assistant asks once whether to resume
  it or start a new one; the stopped run keeps what it recorded.
- **FR-019** The chat can start the "map a process" step: `request_scan` with `process
  {name, goal}` hands the crawler one trace run (the `map` step), with the same decisions and
  focus. One crawler runs per portal at a time (a scan or a trace).

## Out of scope

- Editing or deleting a portal from the GUI (files stay editable by hand).
- Logged-in personas from the form (the chat's persona questions cover them).
- Deleting a whole portal from the GUI.
