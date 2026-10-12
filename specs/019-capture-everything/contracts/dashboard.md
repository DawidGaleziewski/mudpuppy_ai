# Contract: dashboard — spec 019 changes

## Store picker (F-21)

- Every page accepts `?store=<key>`; keys: `main:<env>` (the main data dir's `data/db/<env>.sqlite`)
  and `eval:<dirname>:<env>` (`<tmp>/<dirname>/data/db/<env>.sqlite`, `dirname` matching
  `pf-eval-<portal>-<6 chars>`; as built, the env is part of the key). An eval key is only ever
  resolved against the listed workspaces, never opened as a path. Unknown or vanished keys fall
  back to the default store with a note. Evidence images (`/evidence/<sha>`) are looked up in the
  main store, then in every eval workspace (content-addressed, so the same name is the same file).
  The legacy `?env=<env>` keeps working (= `main:<env>`).
- The picker lists main stores first, then eval workspaces newest first: `eval · <portal> · <local time>`.
- Links keep `store` like they keep `env` today.

## Empty portal

A portal page (`/docs/<portal>`, overview) with no runs in the current store answers 200 with a
message naming the current store and listing the stores that hold runs for the portal, each as a
link with `?store=<key>` (was: 404 / empty).

## State page: "Reached under" (R-37, R-38)

The state page gets a section listing the state's entry URLs (verbatim, newest run first, with
via and the hop chain as `kind status → url`), and the parameter inventory table (name, in, values,
distinct, visits).

## Startup line

`pathfinder-dashboard` prints `store <path> (env <resolved env>)`.
