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

## Attributes and test users from a CSV (spec 024)

`attributes:` says what decides this test user's access: tariff, contract, feature flags, any key.
Values are text, numbers, booleans or lists of them; `extends` merges them per key. MudPuppy
stores and shows them and never interprets them.

```yaml
attributes: { tariff: premium, contract: B2B, features: [export, share] }
```

Many logged-in personas at once: `pnpm --dir apps/crawler personas:import <portal> users.csv
[--extends <mixin>] [--env sandbox|staging|production]`. The header is
`persona_id,login,password,<attribute columns…>`; a list cell is `a|b`, an empty cell sets nothing.
Each row becomes `personas/<portal>/<persona_id>.yaml` with `auth` refs
(`<PORTAL>_<ID>_LOGIN`, `…_PASSWORD`) and the row's attributes, and the two values go to the vault
for that environment (one environment per import). Viewport, locale and the action ceiling come
from the mixin: `--extends`, else `personas/<portal>/_mixins/login.yaml` when it exists. Importing
the same file again updates the same files and vault rows; other keys you added to a persona file
stay. Passwords are never written to a file or printed.
