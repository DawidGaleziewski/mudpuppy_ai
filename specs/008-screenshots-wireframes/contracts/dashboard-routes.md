# Contract: Dashboard routes and panels

All GET-only. Nothing writes.

## `GET /evidence/{ref}`

- `ref` must match `^[0-9a-f]{64}\.(png|svg|excalidraw)$`. Anything else returns 404, so the
  route never serves snapshots, shapes or paths.
- Responds with the file from `<data_dir>/evidence/<ref>`.
  - Content types: `image/png`; `image/svg+xml`; `application/json` for excalidraw, with
    `Content-Disposition: attachment; filename="<name>.excalidraw"` when `?download=<name>` is
    given.
  - Headers: `Cache-Control: public, max-age=31536000, immutable`, because content-addressed
    files never change. SVGs also get `Content-Security-Policy: default-src 'none'; style-src
    'unsafe-inline'`.
- A missing file returns 404.

## `GET /states/{state_id}?env=`

- Header: title, route template, cluster, first-seen run (link), confidence, stabilization.
- Tabs: **Screenshot** (default when present) | **Wireframe**. With no screenshot, the Wireframe
  tab is selected and marked "No screenshot recorded; wireframe shown".
- The Screenshot tab shows the image at container width with a full-size link. A toggle, "Show
  elements", outlines every boxed element; it works with a `?elements=1` link and needs no JS.
- The Wireframe tab shows the SVG inline (`<img>`), with Download SVG and Download Excalidraw
  links.
- Under the image: "Cited by", the records whose links point at this state or its regions.
- Unknown state: the 404 page, in the same style as runs.

## Run detail → States table

The title links to `/states/{id}`. A new column, "Picture", shows a 64 px thumbnail, or
"wireframe" when there is no screenshot.

## Record page (`/docs/{portal}/{key}`) → Screens panel

- For each state cited by the current revision through `state` or `screen_region`, in link
  order and de-duplicated by state, the panel shows one figure: the screenshot (or wireframe),
  with this record's regions drawn as numbered outlines (`<span class="hl">`, percentage
  coordinates). Below it is a legend: number, key, note, and "not visible on the screenshot"
  when the region has no box.
- It sits above the existing Evidence table and is collapsed when there are more than 3
  figures.

## Styling

Console design tokens only. Outline: 2px `var(--accent)`, 1px white halo, badge with
`var(--accent)` background. Made with the `frontend-dev` agent and the `revamp-dashboard` skill.
