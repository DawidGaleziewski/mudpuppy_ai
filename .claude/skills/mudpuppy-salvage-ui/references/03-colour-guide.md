# 03 · Colour guide: what each colour is designed to show

> **Colour says who should care. Shape and line say how certain it is. The word says exactly what.**
> All three are always present. Colour alone never carries meaning.

Use the **role tokens** (`--sy-intent`, `--sy-ok`, …) in code, never hex values and
never raw palette names in components. Visual reference: `design-system/components.html`
(top section) and `brand/brand-book.html` §05.

---

## 1. The paints: one job each

| Paint | Hex | Role token | It means | Use it for | Never use it for |
|---|---|---|---|---|---|
| **Marker** (spray-paint orange) | `#FF8F1F` | `--sy-intent` | **A person should act here.** Intent. | The brand paint block; at most one primary button per view; "Needs you" status, plate and count badge; `Tagged for migration`; focus ring; link underline | Success, OK, pass/fail; decoration; more than one primary button or intent plate per view |
| **Manila** (tag card) | `#E9D8A6` | `--sy-tag` | **A record or a person's words.** | Record ID tags (SCR-001, AMD-001 r2, CAP-005, run ids); notes, annotations and amendment text (with typewriter type) | Buttons, panels, highlights, anything the machine generated |
| **Blueprint** (drafting blue) | `#7AA7FF` | `--sy-tobe` | **Drawn, not built.** Not settled. | To-be steps and variants; assistant proposals and drafts; inferred records; the dashed to-be variant picker; diff "changed / new" | Anything observed or real; links (links are chalk + marker underline). Always paired with a **dashed** line |
| **Inspected** (green) | `#7BC47F` | `--sy-ok` | **Passed / settled.** | `ok` status: scan finished, observed, confirmed, saved; "Assistant up"; applied proposals | Primary actions, brand, "go" buttons |
| **Coolant** (cyan) | `#56C2E6` | `--sy-active` | **Active right now.** | `running` (pulsing square) and `live` statuses: a scan in progress, the variant live in an environment, progress fill of a running scan | Links, selection, info banners |
| **Failure** (red) | `#FF5A5F` | `--sy-fail` | **It broke, or this destroys something.** | `failed` status, error states, `.sy-btn--danger` (Revoke, Remove step), invalid field border and message | Warnings, "needs attention", emphasis, kind/category colours. Nothing else, ever |

### Neutrals (the steel and the chalk)

| Name | Hex | Role token | Job |
|---|---|---|---|
| steel-900 | `#111315` | `--sy-bg-ground` | Page ground, carries the 24px yard grid |
| steel-850 | `#141618` | `--sy-bg-well` | Recessed areas: chat composer, plate footers, read-only inputs |
| steel-800 | `#181B1E` | `--sy-bg-plate` | Plates: panels, header, nav, drawer (always solid) |
| steel-700 | `#202428` | `--sy-bg-raised` | Hover; your own chat messages; current row |
| line | `#2C3136` | `--sy-border-weld` | Rows inside a plate (decorative) |
| strong | `#464D55` | `--sy-border-plate` | Plate edges (decorative, never the only cue) |
| edge | `#6B737C` | `--sy-border-control` | Control borders: inputs, selects, secondary buttons (≥3:1) |
| chalk | `#E8E4DA` | `--sy-text`, `--sy-bg-inverse` | Text; inverse fill for the selected nav item and pressed segment |
| ash | `#A3A69F` | `--sy-text-muted` | Secondary text; hollow statuses (stopped, to do, skipped, queued, not observed); disabled text |
| ink | `#1B1A17` | `--sy-text-on-tag` | Text on manila |

**Elevation is lightness, not shadow:** ground (darkest) → well → plate → raised (lightest).
Something "on top" is one step lighter. There are no drop shadows anywhere.

---

## 2. "I want to say X": which colour?

| You want to show… | Use | Example |
|---|---|---|
| A person must act | marker: `data-status="needs"`, `.sy-plate--intent`, `.sy-count` | "3 · Sort into processes ■ NEEDS YOU" |
| The main thing to do on this view | `.sy-btn--primary` (marker fill) | SEND, SAVE AS B R2, EXPORT SPEC |
| The main action inside a card, when the page already has a primary | `.sy-btn--strong` (chalk edge) | "Apply as r2" in a proposal |
| It worked, or it's settled | inspected: `data-status="ok"` | "■ OK", "■ OBSERVED", "■ SAVED" |
| It's happening now | coolant: `data-status="running"` (pulses) | scan 01a110d5 running |
| This variant is live somewhere | coolant: `data-status="live"` | "■ LIVE · SANDBOX" |
| It stopped, or hasn't started | ash, hollow square: `stopped`, `todo`, `skipped` | "□ STOPPED 171 / 400" |
| It's waiting or wasn't seen | ash, dashed corners: `queued`, `unobserved` | "113 queued", "not observed" |
| It's a proposal or drawing, not real yet | blueprint, dashed: `draft`, `inferred`, `.sy-drawn`, `.sy-proposal` | "4 processes, drafted · INFERRED · NOT SAVED" |
| It broke | failure, cross: `data-status="failed"`, `.sy-state--failure` | "✕ FAILED", "Assistant down" |
| This deletes or revokes something | `.sy-btn--danger` + confirm dialog | "Revoke staging" |
| It's a record you can follow | manila tag `.sy-tag` | `SCR-001`, `01a110d5` |
| A person wrote this | manila + typewriter `.sy-note` | "Test note, rename this button to Save." |
| This part is tagged for migration | `.sy-tag--intent` (marker tag) | "TAGGED FOR MIGRATION" |
| Selected (not focused) | 2px chalk weld: `aria-selected`, `aria-current`, `.sy-selected` | selected review item |
| Keyboard focus | 2px marker outline, 2px gap (automatic `:focus-visible`) | any control |
| Secondary information | ash text | timestamps, helper copy |
| Disabled | ash text, line border, `not-allowed` cursor | `<button disabled>` |
| The assistant is pointing at part of a recorded screen | `.sy-mark`: marker outline + steel inner ring | "MARKED BY ASSISTANT" |

---

## 3. Status matrix (the complete list)

| `data-status` | Shape | Colour | Typical words |
|---|---|---|---|
| `ok` | ■ filled | inspected | OK, Observed, Confirmed, Saved, Stored, Assistant up |
| `running` | ■ filled, pulsing | coolant | Running |
| `live` | ■ filled | coolant | Live · sandbox, Active |
| `needs` | ■ filled | marker | Needs you, 4 to review, End not reached, Re-anchor |
| `stopped` | □ hollow | ash | Interrupted, Stopped |
| `skipped` | □ hollow | ash | Skipped |
| `todo` | □ hollow | ash | To do, Not configured |
| `queued` | ⌜⌟ dashed corners | ash | Queued, Pending, Connecting |
| `unobserved` | ⌜⌟ dashed corners | ash | Not observed, Not observable |
| `draft` | ⌜⌟ dashed corners | blueprint | Draft, Proposed, Latest drawing |
| `inferred` | ⌜⌟ dashed corners | blueprint | Inferred, Suggested |
| `failed` | ✕ cross | failure | Failed, Error |

Shape grammar: **filled** = it happened or is happening · **hollow** = it didn't (yet) ·
**dashed** = unconfirmed · **cross** = it broke.

---

## 4. Rules for combining colours

1. **Paint fills are rare.** Only these get a solid paint background: the wordmark paint block,
   the primary button, the count badge, the intent tag, the inverse (chalk) selected nav item or
   pressed segment, manila tags and notes, the meter fill (status colour), the skip link, the
   assistant highlight label and text selection. Everything else is steel with coloured text or edges.
2. **Tints stay at or under 10%.** `--sy-intent-tint`, `--sy-tobe-tint` and `--sy-fail-tint` are the only coloured backgrounds,
   used for a needs-you row or current step, the assistant highlight, a selected drawn block or a failure callout.
3. **Blueprint is always dashed.** A solid blue line means nothing in this system.
4. **Manila carries only records and people.** Never machine text on manila, never typewriter on steel.
5. **No two meanings on one element.** A row is either needs-you (marker) or failed (red), never both.
   If both are true, show failure and put "needs you" in the Review inbox count. Different *fields*
   may differ: a scan whose **status** is `stopped` (Interrupted) can show a **stop reason** of
   `failed` with its ERR reference, as two separate elements (screen 10).
6. **Orange budget per view:** at most one primary button and one intent plate, plus small needs-you statuses and counts.
7. **Links** are chalk with a marker underline. They are not blue (blue means drawn) and not orange text
   (orange text means needs you).
8. **Charts** (if added later, e.g. scan coverage): categorical series use neutrals and patterns
   (chalk, ash, edge, dashed or hatched) plus direct labels. Use meaning colours only for their meaning
   (coolant for the running series, failure for failed counts). Never colour categories with marker or failure.

---

## 5. Contrast (WCAG 2.2, measured)

Text needs 4.5:1 (AA). Large text, control borders, focus rings and status shapes need 3:1.

| Foreground \ background | ground `#111315` | well `#141618` | plate `#181B1E` | raised `#202428` |
|---|---|---|---|---|
| chalk `#E8E4DA` | 14.67 | 14.29 | 13.62 | 12.30 |
| ash `#A3A69F` | 7.55 | 7.35 | 7.01 | 6.33 |
| marker `#FF8F1F` | 8.16 | 7.95 | 7.58 | 6.84 |
| manila `#E9D8A6` | 13.16 | 12.82 | 12.22 | 11.04 |
| inspected `#7BC47F` | 8.91 | 8.68 | 8.27 | 7.47 |
| coolant `#56C2E6` | 9.09 | 8.86 | 8.44 | 7.63 |
| blueprint `#7AA7FF` | 7.80 | 7.60 | 7.25 | 6.54 |
| failure `#FF5A5F` | 6.10 | 5.94 | 5.67 | 5.12 |
| edge `#6B737C` (borders) | 3.87 | 3.77 | 3.60 | 3.25 |
| strong `#464D55` (decorative) | 2.18 | 2.12 | 2.02 | 1.82 |

| Pair | Ratio |
|---|---|
| ink `#1B1A17` on manila | 12.30 |
| note author `#5A564C` on manila | 5.17 |
| steel-900 on marker (primary button) | 8.16 |
| steel-900 on chalk (selected nav) | 14.67 |
| steel-900 on marker (intent tag) | 8.16 |
| chalk on intent tint (needs-you row) | 11.57 · ash 5.95 · marker 6.43 |
| marker outline on a light recorded page | **2.00 → why the steel inner ring exists (D-22)** |
| steel ring on a light recorded page | 16.34 |

**Colour-vision check.** Status colours were simulated with Viénot deuteranopia and protanopia.
OK and failure, running and to-be, and OK and ash come out close, so no status relies on hue: shape, line style and word separate them (D-06).

---

## 6. Do / don't

- ✅ Find "what needs me" by scanning for orange. ❌ Use orange for a "Save successful" toast. Use inspected.
- ✅ Draw proposals dashed blue until applied, then solid green "Applied". ❌ Show an applied change in blue.
- ✅ Put run ids on tags: `01a110d5`. ❌ Paint ids in brand orange.
- ✅ Show "Assistant down" as a failure state with the reference ERR-… ❌ Turn the whole header red.
- ✅ Use ash for stopped or interrupted. ❌ Use red for interrupted (nothing broke; it stopped).
