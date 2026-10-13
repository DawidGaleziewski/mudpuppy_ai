# 01 · Brand book: MudPuppy · Salvage Yard

> **Tag it, strip it, ship it.**
> Visual version: `brand/brand-book.html` (screenshot: `screenshots/system/brand-book.png`).

## What we are

**Mission.** MudPuppy documents what an application actually does today, before anyone migrates
it. It observes the running app, records evidence, and turns that evidence into business-analysis
documentation: capabilities, screens, processes, requirements, business rules, a data dictionary
and a glossary. Every statement points back to what was seen. Anything that could not be observed
is marked as such and becomes an open question. MudPuppy is open source.

**For whom.** Legacy developers, BAs and QAs on enterprise portal migrations, who spend all day in
tools like Sitecore or AEM and use an AI harness to do the walking. People who read evidence for hours.

**The metaphor: a salvage yard.** The old portal is the lot. Screens are **parts**. Records are
**tags**. The to-be is a **blueprint** drawn over the parts. People's notes are **typed** on the
tags. Nothing is thrown away until someone decides.

## Personality

| Trait | Means | Doesn't mean |
|---|---|---|
| **Honest** | Shows what was observed, marks what was guessed | Filling gaps with plausible guesses |
| **Workmanlike** | A tool on a workbench: dense, square, labelled | Showroom polish, gradients, glass |
| **Dry humour** | At most one yard word per screen | Jokes in errors, cowboy talk, emoji |
| **Easy on tired eyes** | Dark steel, warm chalk text, no motion you didn't ask for | Neon, glow, scanlines, busy textures |

## Names

- **MudPuppy**: the product. Written "MudPuppy" in prose; "MUDPUPPY" only in the wordmark.
- **Salvage Yard**: the design system (and this visual direction).
- **console**: the web UI, when a scope is needed (`[MUD]PUPPY console`).

## Wordmark

- Live text, never an image of letters: `<span class="sy-wordmark"><span class="sy-wordmark__paint">MUD</span>PUPPY</span>`.
- Archivo 800, 125% width, uppercase, +0.02em. "MUD" in steel-900 on a marker paint block; "PUPPY" in chalk.
- Sizes: 22px in the app header (the minimum, ≈15px cap height), 44px on brand surfaces.
- Clear space: one paint-block height on every side.
- Optional scope: `.sy-wordmark__scope` in Plex Mono, ash ("console").
- Replaces `mudpuppy://console` (see D-23).

## Mark

The existing pixel mudpuppy, recoloured pixel by pixel to Salvage tokens: it crawls along a survey
grid with a fading trail of marker cells, standing for discovery, one cell at a time. **The external
gills are the one non-negotiable detail.** Without them it is a generic salamander, so never crop them.

| File | Use | Size |
|---|---|---|
| `brand/logo/mark-grid-path.svg` | README, docs cover, splash, empty-yard state | ≥ 64px |
| `brand/logo/mark-creature.svg` | Where the grid doesn't fit (transparent, dark grounds) | 24–63px |
| `brand/logo/mark-mono.svg` | One-colour stamps, stencils, print | any |
| `brand/logo/tag-icon.svg` | Favicon, app icon | < 24px |

Recolour map (from the mission-doc rust palette): body rust → marker `#FF8F1F`; back and gills
mustard → manila `#E9D8A6`; belly teal → edge `#6B737C`; tail swamp → ash `#A3A69F`; feet → `#B25F14`
(a mark-only shade); shadow → steel-700; grid → line `#2C3136`; ground → steel-900.

The mark is **not** used in the app header; the paint-block wordmark carries the brand there.

**Never:** add letters, gradients or glow to the mark; recolour it; place it on a light background; rotate it.

## Colour

Six paints on steel, one job each. Full guide: `03-colour-guide.md`.
Marker = intent · Manila = records and people · Blueprint = drawn, not built · Inspected = OK ·
Coolant = active now · Failure = failure only · Steel/chalk/ash = everything else.

## Type

Machines print, humans type: **Archivo** (UI and prose; Expanded caps for short labels) ·
**IBM Plex Mono** (IDs, routes, timestamps, statuses) · **Special Elite** (only what a person wrote).
All three cover Polish.

## Graphic devices

| Device | Meaning | Where |
|---|---|---|
| Yard grid (24px, 3.5% chalk) | The lot | Page ground only |
| Manila tag (cut corner, punched hole) | A record you can follow | Every record ID |
| Paint block | Intent / brand | Wordmark, primary button, needs-you count |
| Blueprint line (dashed blue) | Drawn, not built | To-be, drafts, proposals |
| Dimension line | A person's note about a thing | Annotations |

## Voice

Inventory voice: **counts first, then the next move.**

| Do | Don't |
|---|---|
| 171 of 400 steps. 17 parts logged, 113 pages unchecked. Resume the scan to find the end of the line. | Oops! Looks like our crawler took a little nap 😴 |
| Assistant down. Reference ERR-01M48D… Restart it, then retry. Read-only pages keep working. | Something went wrong. Please try again later. |
| Yard's empty. Add a portal address to start the inventory. | Yee-haw, partner! This here junkyard ain't got no junk yet! |

Say: portal, scan, screen, process, record, amendment, revision, environment, as-is, to-be.
Yard words, sparingly: parts, lot, tag, scrapped, salvage, drawing, inventory.
Never: magic, AI-powered, seamless, oops, emoji in the product UI.

## Misuse

- Drawing the wordmark as an image, outlining it, or using any font but Archivo Expanded.
- Marker for success, red for "warning", blue for anything real.
- Rounded corners, drop shadows, grain or rust textures over data.
- Typewriter for machine output.
- Two primary buttons or two intent plates in one view.
