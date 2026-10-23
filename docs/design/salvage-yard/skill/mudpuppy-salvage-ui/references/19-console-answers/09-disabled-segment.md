# Q9 · "This page" when there is no page context

**Question.** The segmented control has no disabled state, so the drawer shows only "Whole yard" as text there. Do we want
a disabled segment, as in the htmx drawer?

## Decision

**Yes: keep both segments; "This page" is disabled with `aria-disabled="true"` and says why.**

```html
<div class="sy-seg" role="group" aria-label="What the assistant can see">
  <button type="button" aria-pressed="false" aria-disabled="true" aria-describedby="ctx-why">This page</button>
  <button type="button" aria-pressed="true">Whole yard</button>
</div>
<span id="ctx-why" class="sy-small sy-muted">Nothing on this page to ask about. Open a screen, process or rule to use This page.</span>
```

| | |
|---|---|
| **Why keep it** | The control looks and sits the same on every page, so people learn it once and nothing jumps. Text-only "Whole yard" hides that a page context exists |
| **`aria-disabled`, not `disabled`** | It stays in the tab order, so a screen reader user hears the segment *and* the reason. A `disabled` button is skipped and the reason never heard. Your click handler ignores it |
| **Looks** | Ash text, no hover, `cursor: not-allowed`; Whole yard is pressed (chalk). In forced colours: GrayText |
| **Which pages** | Pages that are about one thing (a screen, a process, a rule, a change, a finding) enable This page. Lists, Home, Settings and Scans don't |
| **The reason line** | Always the same sentence, under the switch, where the context summary goes on other pages |

The class works for any segmented control (`.sy-seg > [aria-disabled="true"]` and `:disabled`). Demo:
`components.html#c-22-drawer`.

## What to change

- [ ] `SegmentedControl`: a `disabled` option per segment that renders `aria-disabled="true"` and blocks the click; the
      drawer passes the reason line's id.

## Acceptance

- On Home, Tab reaches "This page"; a screen reader says it is dimmed/unavailable and reads the reason; pressing it does nothing.
