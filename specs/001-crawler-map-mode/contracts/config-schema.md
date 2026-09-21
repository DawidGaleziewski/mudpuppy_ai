# Contract: Portal & Persona Configuration Schema

Both file kinds are validated by the same Zod schema set in `packages/config`, which is the
single source of truth (constitution Technical Constraints). Invalid, circular, or
secret-leaking files are rejected with an error naming the file and the specific problem
(FR-017).

## Portal — `portals/<portal>/portal.yaml`

```yaml
id: marketsite
base_url: https://marketsite.example/
environment: production          # required to unlock a run against this address — FR-005
max_action_class: read           # optional portal ceiling; defaults to `read` when production
compliance:                      # FR-026: production is refused while any value is null
  robots_checked_on: null        # ISO date, filled by a person after checking robots.txt
  terms_reviewed_on: null        # ISO date, filled after reviewing the portal's terms
  terms_reviewed_by: null        # who reviewed
scope:
  allowed_domains: [marketsite.example]
  allowed_paths: ["/*"]
  external_link_policy: record    # record | follow
  max_depth: 6
  max_states: 500
  max_actions_per_state: 20
  max_run_time_minutes: 60
  max_steps: 2000
denylist:
  - logout
  - delete
  - payment
  - bidding
  - buy_now
  - message_or_contact_seller
  - reveal_seller_contact
  - path:/oferty/wystaw/*        # listing-creation path disallowed by robots — FR-007
  # built-in rule ids also carry PL/EN path patterns (e.g. logout: /wyloguj, /logout) so a
  # direct `navigate` to such a URL is refused; portals may add `path:` entries
obstacles:
  - id: cookie_banner
    selector: "#cookie-consent button[data-accept]"
  - id: promo_popup
    selector: ".promo-modal .close"
rate_limit:
  requests_per_second: 1
  max_concurrency: 1
  user_agent: "PathfinderAI-Crawler/0.1 (+contact@example.com)"
item_view_cap: 25                 # FR-024
item_route_templates:             # which route templates count as individual item pages (FR-024)
  - "/oferta/:id"                 # placeholder — verify against the live site
```

**Zod-level rules**:

- `environment` is a required enum (`production | staging | sandbox`); a production run
  without this file declaring `production` is refused before any page opens (FR-005, SC-006).
- `denylist` entries are either a known rule id or a `path:` glob; unknown free-text entries
  are rejected at load time rather than silently ignored.
- `rate_limit` is required when `environment: production` (FR-006).
- `max_action_class` is optional; when absent it is `read` for production. Staging/sandbox
  portals may declare a higher ceiling. It is the portal side of the `min()` in FR-018.
- `compliance` values may be null (the file still loads), but `preflight` refuses a production
  run while any is null, or while `rate_limit.user_agent` contains `example.com` (FR-026).

## Persona — `personas/<portal>/[<process>/]<persona>.yaml`

```yaml
id: guest
extends: []                       # or ["_mixins/anonymous-base.yaml"]
auth: none
max_action_class: read            # never higher than the portal's ceiling — FR-018
consent:
  decline_location: true
  decline_marketing: true
  decline_personalization: true
viewport: { width: 1366, height: 768 }
locale: pl-PL
```

A mixin, e.g. `personas/_mixins/anonymous-base.yaml`, has the same shape and is referenced by
relative path in `extends`. Composition rule: files are resolved depth-first in `extends`
order, then the target file itself is applied last, so **later entries override earlier
ones** field by field (FR-016).

**Zod-level rules**:

- `extends` cycle detection walks the reference graph before merging; a cycle fails with the
  offending file path in the error (FR-017, User Story 3 Scenario 5).
- Any `auth` field that looks like a literal credential (matches a secret-shaped value rather
  than a `ref:`-prefixed name) is rejected at load time — credentials are referenced by name
  only (FR-017, User Story 3 Scenario 4).
- After resolution, the effective `max_action_class` used by a run is
  `min(portal.max_action_class (default read on production), resolvedPersona.max_action_class)` — a persona can only
  restrict, never widen, the portal's ceiling (FR-018).

## Loader output (consumed by `crawler` and `safety`)

```ts
type EffectiveConfig = {
  portal: PortalConfig;                 // validated, as loaded
  persona: PersonaConfig;               // fully resolved (post-extends)
  effectiveMaxActionClass: SafetyClass; // min(portal, persona)
};
```

This is the only object the `crawler` package's session/policy layer reads from — it never
re-parses YAML itself, keeping config parsing and run logic separated per the constitution's
package boundaries.
