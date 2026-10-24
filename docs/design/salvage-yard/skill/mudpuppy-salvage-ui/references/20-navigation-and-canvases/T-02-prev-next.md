# T-02 · Previous / Next through the list a page was opened from

**Answers:** Q4.1–4.3 · **Size:** S · **Depends on:** T-01 (the same navigation state) · **Screens:**
`screens/v2-17-screen-from-process.html` · **Demo:** `components.html#c-23-nav`

## Decision

| Question | Answer |
|---|---|
| Placement on the Screen page | **In the page head's actions, left of the other actions**, as on a Docs record. Not a bar under the crumbs: one more full-width row pushes the content down on every visit |
| Words | `← Previous · 4 of 37 · Next →`. The buttons say Previous / Next; the neighbour's title is in `title` (hover) and in the accessible name ("Next: Kalkulator OC/AC — opcje"). The position is mono, tabular figures |
| Which list | The one the page was opened from (same filter, sort, page): the Screens list, a process's steps, Changes rows that are screens, the "In no process" view. Its name is the nav's `aria-label` ("Steps of Oblicz składkę OC/AC"); on screen, the crumb (own list) or the back link (another section) already says it |
| Ends | At the first / last item the button stays, disabled (`aria-disabled`, no `href`), so the controls don't move |
| Keys | **J / K** = next / previous, as in Review and on Docs records. Only while focus isn't in a field; turned off in Settings ▸ Keyboard like the other single keys |
| When there's no list | Opened from the nav, search or a pasted URL: no pager at all |
| Phones | The pager stays in the head's actions and wraps under the title |

## Build

1. The list page passes its **ordered ids** (not the full items) in the link state: `state.list = { ids, label, href }`. For
   long lists pass the current page's ids plus the query to fetch the next page when you step past the end.
2. The detail page renders `.sy-pager` when `state.list` contains its id.
3. Moving keeps `state.from` / `state.list` (so the back link and the pager survive) and uses `replace` navigation, so
   Back returns to the list, not through every neighbour.

## Markup

```html
<nav class="sy-pager" aria-label="Steps of Oblicz składkę OC/AC">
  <a class="sy-btn sy-btn--sm" role="link" aria-disabled="true">← Previous</a>          <!-- first item: no href -->
  <span class="sy-pager__pos">1 of 5</span>
  <a class="sy-btn sy-btn--sm" rel="next" href="/screens/SCR-013" aria-label="Next: Kalkulator OC/AC — opcje" title="Kalkulator OC/AC — opcje">Next →</a>
</nav>
```

## Acceptance

- From the Screens list filtered by a part, J / K walk the filtered list in its order; Back returns to the list.
- The first item has a disabled Previous that doesn't move the layout.
- Screen readers hear "Next: {title}, link".
