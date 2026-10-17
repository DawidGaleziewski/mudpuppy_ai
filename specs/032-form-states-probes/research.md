# Research 032: telling same-URL form steps and their error states apart (US1 spike)

Spike run 2026-10-16 on master `6703325` plus the new scar SC-19 (`/sc19/apply`, a three-step
wizard rendered by script on one URL). A scripted map run goes through the gate harness: navigate,
`act` Next (autofill), Next on step 2, the radio "Business", then items of step 1 and step 2 while
the browser is elsewhere. The throwaway test was not committed; the snapshots below are the ones it
recorded.

## What today's pipeline records

| # | What happened | State | Cluster / screen |
|---|---|---|---|
| 1 | open `/sc19/apply` (step 1) | A | new cluster, screen S1 r1 |
| 2 | Next (autofill filled 4 fields; native validation passed) | B (step 2) | new cluster (similarity 0.36), screen S2 r1 |
| 3 | Next on step 2 (autofill typed `Test` into "Start date") | C (step 2 with the error "Enter the start date as DD.MM.YYYY.") | **same cluster (0.94): screen S2 r2** |
| 4 | radio "Business" (from state B, browser on C) | refused: `radio "Business" is no longer present` | — |
| 5 | radio "Private" (from B) | `goto(/sc19/apply)` lands on step 1, the item fails | — |

Signals in the ARIA snapshot (Playwright):

- Form controls appear as `textbox "Full name"`, `spinbutton "Year of birth"`, `radio "Private"`,
  with the visible form name when there is one (`form "Your details"`).
- A field the page marks invalid shows `[invalid]` (from `aria-invalid`). The message is the text of
  the alert next to it (`alert: Enter the start date as DD.MM.YYYY.`). Empty alerts are present all
  the time.
- Typed values appear as children (`textbox "Promo code (optional)": Test`), so every fill gives a
  new level-1 state.
- Browser-native messages (`required`, `type=email`, `pattern`, `min`/`max`) never appear. After a
  refused submit the snapshot is unchanged, so the state does not change. The messages can only be
  read from the DOM (`validationMessage` of each `:invalid` control) right after the submit.
- Textboxes are not issued as map-mode actions; autofill fills them before a submit. The only
  actions on step 2 are the radios and Next.

## Findings that decide the design

1. **Steps on one URL are already separate clusters** when their controls differ (0.36 similarity):
   they become separate screens. The fingerprint does not need to change for US1.1.
2. **A validation state merges into its step's cluster** (0.94) and shows as revision r2 of the
   screen. Revisions are meant for "the screen changed over time" (spec 022), so this is wrong. A
   kind on the state fixes it without changing identity.
3. **A radio that reveals fields changes the control set** (Business adds "Company name" and
   "Tax number"). An exact control-set key would call that a new step; it is the same step in a
   different variant.
4. **Returning to a step by URL is wrong on a same-URL wizard** (rows 4–5). Probing (and any later
   item of step 2) needs a way back within the run.

## Chosen rule

- **Form step** (new `FormStepIndex` in `fingerprint`, pure): the form controls of a state are the
  nodes with role textbox, searchbox, combobox, listbox, spinbutton, slider, radio, checkbox or
  switch, each as `role|name`, plus the form's accessible name when it has one. A state joins an
  existing step of the same route template when:
  - both have the same non-empty form name, or
  - neither has a form name and their control sets overlap with a Jaccard ≥ 0.5.

  Otherwise it starts a new step: number = the route's highest step + 1. A state with no form
  controls is no form step.
  - SC-19: step 1 vs step 2 share 0 controls; step 2 vs step 2 + Business is 4/6 = 0.67, so they
    are the same step.
- **Error signals** (`errorSignals`, pure): controls with `[invalid]`, plus alerts with non-empty
  text. `canonicalizeAria` keeps an `invalid` flag on the node without changing the level-1 text,
  so state identity is unchanged.
- **State kind**: `validation` when a form-step state has error signals, `technical` when a
  technical probe first reached it, otherwise `main`.
- **Native messages** are read by the probe step from the DOM after the submit and stored on the
  probe outcome (`messages[].source = 'native'`). The state stays the same. The outcome is the
  record of the validation.
- **Back to a step**: the in-run path (plan decision 4).

## Not decided here (R-50)

URL parameters that select a screen (`tryb=druk`) and numbered path sections (`/sc01`) stay under
R-50. Form steps work inside one route template and do not change route templates.

## Alternatives rejected

- Lowering the cluster threshold: it would split listing pages again (spec 001 research §1) and
  would still not tell a validation state from a step.
- An exact control-set key: it fails on revealed fields (finding 3).
- The form step from the heading text: legacy forms often have no heading per step, and headings
  hold counts ("Step 2 of 3") that could match the next step's by accident.
