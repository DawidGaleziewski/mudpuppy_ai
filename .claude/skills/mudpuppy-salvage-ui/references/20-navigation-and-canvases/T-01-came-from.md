# T-01 · Came from: one step back to the exact page you left

**Answers:** Q1 · **Size:** M · **Depends on:** — · **Screens:** `screens/v2-17-screen-from-process.html` · **Demo:**
`design-system/components.html#c-23-nav`

> Owner, 24 Oct: "where going into nested route like screen → selecting process. I cannot go one step back. I have to click
> screen again. This is general for whole project."

## Decision

Your proposal, with three additions: **one link above the crumbs, "← {kind} {title}", back to the exact address you left.**
It shows only when the crumbs don't already lead back there. When you came from the page's **own list**, there is no
link: the parent **crumb itself** carries the list's state instead.

| Question | Answer |
|---|---|
| Where | Its own line **above the crumbs**, first thing in `.sy-pagehead`. Not in place of the first crumb (the crumbs still say where you are) and not at the end of the row (it would wrap away from the title) |
| Words | `← Process Oblicz składkę OC/AC`: the **kind** in mono caps (Process, Screen, Rule, Change, Record, Finding, Scan) and the **title**. Titles, not keys: people remember names. Use the key only when there's no title (a record without one: `← Record SCR-012`). One line, ellipsis, full text in `title` |
| Look | `.sy-backlink`: `.sy-meta`-sized, the arrow, the kind muted, the title as an underlined link. Not a button: it is navigation |
| When | After an **in-app link from a page that the crumbs don't already lead back to**: any cross-section link (Screen → Process, Review → Rule, Changes → Screen, Docs record → Screen, Process → Screen) and a link inside one section to a sibling (Screen → another Screen via "same screen?"). **Not** from the nav, Ctrl K search, a typed address, a new tab, or a bookmark: those start fresh |
| From its own list | Screens list (filtered) → a screen: **no back link**; the crumb reads `Screens · Kalkulator app` and links to the exact list (filter, sort, page). The same for every list → item |
| Chain | **One step**, but each page keeps its own: Screen → Process → Rule shows "← Process …" on the rule; going back there shows "← Screen …" again. That gives the whole trail one step at a time without a breadcrumb of history |
| Phones (390 px) | The back link **replaces** the crumbs (CSS hides the crumbs when a back link is present under 640 px) |
| The browser's Back | Still works and does the same thing; the link is the visible version of it |

## Build

1. Every in-app link to a detail page passes the source in navigation state:
   `navigate(to, { state: { from: { href: location.pathname + location.search + location.hash, kind, title } } })`.
   A `Link` wrapper (`<AppLink from>`) does this for you; the nav, Ctrl K and external links don't use it.
2. The page head reads `location.state?.from`. Show the back link when `from` exists and `from.href` is **not** the parent
   crumb's target (ignoring its query): otherwise update the parent crumb's `href` and label to the list's state.
3. Clicking it: if the previous history entry is `from.href`, call `navigate(-1)` (restores scroll and tab); otherwise
   `navigate(from.href)`.
4. State survives reload (React Router keeps `history.state`). It doesn't survive copy-paste of the URL: that's intended.
5. Titles come from the source page's own heading at the time of the click; don't refetch.

## Markup

```html
<div class="sy-pagehead">
  <a class="sy-backlink" href="/processes/PROC-001?tab=steps"><span aria-hidden="true">←</span><span class="sy-sr-only">Back to </span>
    <span class="sy-backlink__kind">Process</span> <span class="sy-backlink__title">Oblicz składkę OC/AC</span></a>
  <nav class="sy-crumbs" aria-label="Breadcrumb"><a href="/screens">Screens</a> / <span aria-current="page">Kalkulator OC/AC — dane kierowcy</span></nav>
  …title row…
</div>

<!-- From its own list: no back link, the crumb carries the list -->
<nav class="sy-crumbs" aria-label="Breadcrumb"><a href="/screens?part=kalkulator&page=1" title="Screens · Part: Kalkulator app · page 1">Screens · Kalkulator app</a> / …</nav>
```

The accessible name is "Back to Process Oblicz składkę OC/AC", which contains the visible text (WCAG 2.5.3).

## Acceptance

- Screen → its process → Back link lands on the screen with the same tab and scroll position.
- Review (filtered) → a rule → back lands on Review with the filter and the selected item.
- Opening a screen from the nav, Ctrl K or a pasted URL shows no back link.
- Screens list filtered by part → a screen → the crumb says "Screens · Kalkulator app" and returns to that filter.
- At 390 px, a page with a back link shows it instead of the crumbs.
