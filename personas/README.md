# Personas

Each portal is its own workspace (spec 002 FR-024, FR-025). Everything that belongs to one portal
lives in that portal's folders:

```text
portals/<portal>/portal.yaml              scope, denylist, obstacles, action rules, robots settings
personas/<portal>/<persona>.yaml          a persona of that portal (optionally in a <process>/ subfolder)
personas/<portal>/_mixins/<mixin>.yaml    building blocks used only by that portal's personas
personas/_mixins/<mixin>.yaml             portal-neutral building blocks shared by every portal
```

Rules enforced when a run starts (`preflight`):

- A persona may `extends` files under `personas/_mixins/` and under its own `personas/<portal>/`
  (including `personas/<portal>/_mixins/`). Anything else, after resolving `..` and symlinks, fails
  loading with an error naming the persona and the offending file.
- Folders whose name starts with `_` are never searched for personas.
- Only portal-neutral settings belong in `personas/_mixins/` (auth mode, consent defaults, viewport,
  locale). Anything that names a portal's paths, labels or rules belongs in that portal's folder.

`_mixins/anonymous-base.yaml` is the shared base for logged-out personas: no credentials, read-only
ceiling, optional consent declined.
