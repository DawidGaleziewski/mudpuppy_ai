# Contract: Dashboard UI for the Glossary

All routes are GET and read-only (constitution: the dashboard never writes).

## Routes

| Route | Returns |
|---|---|
| `GET /glossary` | Glossary page: scope note, text filter, entries grouped by category then group, each with anchor `#<id>` |
| `GET /glossary/pages/<slug>` | A long explanation page (evidence, frontier); 404 page when unknown |
| `GET /glossary/wiki` | BA wiki index |
| `GET /glossary/wiki/<slug>` | One wiki page with its citations; 404 page when unknown |

The top navigation gains **Glossary** after Activity. The `?env=` parameter is kept on links like
on every other page.

## Glossary page

- Filter: a text input that hides non-matching entries (term, labels, short). Works without JS
  as a GET form (`?q=`); with JS it filters as you type.
- Each entry shows: term, category tag (Pathfinder / BA), short definition, explanation,
  example, where it appears, related terms (links), "Read more" to its long page or wiki page,
  last changed (roadmap id, date). Retired entries show "retired" and the replacement.
- If the glossary file cannot be read or fails validation, the page shows a `[WARN]` notice
  naming the problem, and the rest of the dashboard renders labels without tooltips.

## Macros (templates/partials/macros.html)

`m.term(id, label)`: renders

```html
<span class="gl">Label<a class="gl-mark" href="/glossary#id" aria-describedby="gl-tip-id-N">[?]</a><span class="gl-tip" role="tooltip" id="gl-tip-id-N">Short definition.</span></span>
```

- The tip shows on `:hover` and `:focus-within` of `.gl`; hidden otherwise; respects
  `prefers-reduced-motion`; styled with existing tokens only.
- `N` makes ids unique when one term appears more than once on a page.
- The `[?]` and `[more]` links do not carry `?env=`: the macros are imported without the request
  context, and the glossary does not depend on the environment. Pages and nav links keep it.
- Below 1024px stacked tables hide their header row, so column tooltips are desktop only there;
  section-heading tooltips and intros show at every width.
- Unknown id or no glossary loaded: renders `Label` only.

`m.intro(id)`: renders `<p class="section-intro">Short definition. <a href="/glossary#id">[more]</a></p>`
under the section heading. Unknown id: renders nothing.

## Where they are used (v1)

- `m.intro`: Run (run page header), States observed, Analysis session (session page), Gaps.
- `m.term`: every other column header, section title or status legend whose term is Must/Nice in
  `term-review.md`, e.g. Frontier, Cluster, Stabilization, Safety class, Top locator, Confidence,
  Rev, Cites, Target (evidence), p50/p95.

## Rename

`partials/actions.html`: column header **Target** → **Links to**; cell content unchanged (the
element's `href`). "Target" remains only in `partials/docs/body.html` (evidence table), with a
tooltip.
