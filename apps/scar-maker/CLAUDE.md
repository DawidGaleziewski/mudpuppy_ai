# apps/scar-maker

A local portal of the hardest real-world obstacles the harness met at customer sites (R-56, spec
030): one route per **scar**, proven by a gate case in `apps/crawler/packages/gates/tests/scars-*.test.ts`.
Not part of the crawler's layers; it imports no workspace package and needs no build.

## Commands

- `pnpm --dir apps/scar-maker start [--port 4300]`: serve every scar on two loopback hosts,
  `127.0.0.1` (the portal) and `127.0.0.2` (the second host: identity provider, CDN). The gates run
  their own instance on 4400 (`gates/src/global-setup.ts`); stop anything on 4400 first.
- `pnpm --dir apps/scar-maker test` (fast): catalogue and server unit tests (port 4391).
- Portal config: `portals/scar-maker/portal.yaml`, persona `personas/scar-maker/guest.yaml` (read-only).

## Layout

- `src/server.ts`: listeners, built-in routes (`/`, `/healthz`, `/robots.txt`, `/__admin/reset`),
  the route table from every scar. `src/page.ts` response helpers. `src/types.ts` the scar shape.
- `src/scars/scNN-<name>.ts`: one scar each (`id`, `entry`, `routes`); `src/scars/index.ts` lists
  them. A scar may keep counters in `ctx.memory` (cleared by `/__admin/reset`) and read
  `ctx.host` to behave differently on the second host.
- `scars.yaml`: the catalogue (id, title, field source ids, route, before, after, status gap|gate);
  `src/catalogue.ts` parses it; the catalogue test keeps it equal to the modules.

## Where to add a scar

1. `src/scars/scNN-<name>.ts` + a line in `src/scars/index.ts` + an entry in `scars.yaml`
   (`status: gap`).
2. A `gap('SC-NN', …)` in `gates/tests/scars-*.test.ts` describing the wanted behaviour; when the
   harness is fixed, `gate()` and `status: gate` (G-17).
3. No client data ever: generic DOM, synthetic values, the field ids from the anonymised pack.

## See also

- specs/030-battle-tested-scars, roadmap R-56…R-66, `user_input/mudpuppy-ground-challenge.zip`
