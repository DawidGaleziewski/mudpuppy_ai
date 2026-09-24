# Contract: Portal and Persona Configuration (changes from spec 001)

Extends [spec 001 config-schema](../../001-crawler-map-mode/contracts/config-schema.md). Zod in
`apps/crawler/packages/config` stays the single source of truth; every rejection names the file
and the problem (spec 001 FR-017).

## Portal file additions

```yaml
id: liveinsurer
# ... everything from spec 001 ...

denylist:
  - logout
  - purchase                     # generic ids (FR-012)
  - buy_now                      # still accepted: alias of purchase (FR-013)
  - submit_request
  - path:/logowanie/*            # path only, unchanged
  - url:*itm_campaign=*          # NEW: path + query string (FR-010)

# NEW (FR-009). Default block. Only for requests the page's own scripts make; navigations always obey robots.
robots_page_requests: block      # block | allow_and_record

# NEW (FR-015 to FR-017)
action_rules:
  - id: renew_policy             # new rule: class required
    class: external-side-effect  # mutating | destructive | external-side-effect
    keywords: ["przedłuż polisę", "wznów polisę"]
    paths: ["/przedluzenie/*"]
  - id: purchase                 # extends a built-in rule: class optional, never lower
    keywords: ["jetzt kaufen"]
```

### Validation rules

| Field | Rule | Error example |
|---|---|---|
| `denylist[]` | a built-in id, an alias id, a portal `action_rules` id, `path:<glob>` or `url:<glob>` (non-empty glob) | `denylist[3]: "urls:*x*" must be a rule id, "path:<glob>" or "url:<glob>"` |
| `robots_page_requests` | `block` or `allow_and_record`; default `block` | |
| `action_rules[].id` | lowercase slug; unique within the file; not an alias id | `action_rules[0].id: "buy_now" is an alias of "purchase"; extend "purchase" instead` |
| `action_rules[].class` | required for a new id; for a built-in id optional and ≥ the built-in class; never `read` | `action_rules[1]: class "mutating" is lower than built-in "purchase" (external-side-effect)` |
| `action_rules[].keywords` | non-empty phrases; matched after normalisation (lower case, diacritics stripped) on word boundaries | |
| `action_rules[].paths` | globs over the normalised URL path (`*` spans anything) | |
| `action_rules[]` | at least one of `keywords`, `paths` | `action_rules[2]: needs keywords or paths` |

Unknown fields are still rejected (`.strict()`).

### Built-in rule ids after this feature

| Id | Class | Aliases |
|---|---|---|
| `logout` | destructive | |
| `delete` | destructive | |
| `payment` | external-side-effect | |
| `purchase` | external-side-effect | `bidding`, `buy_now` |
| `contact_or_message` | external-side-effect | `message_or_contact_seller` |
| `reveal_contact` | external-side-effect | `reveal_seller_contact` |
| `submit_request` | external-side-effect | |
| `mutating:favourite`, `mutating:cart`, `mutating:save` | mutating | (classifier-only, not denylist ids, as in spec 001) |

## Persona file changes

No new fields. Loading gains a fence (FR-024, FR-025):

- A persona `personas/<portal>/[<process>/]<persona>.yaml` may extend files under
  `personas/_mixins/` (shared, portal-neutral) and `personas/<portal>/` (its own portal,
  including `personas/<portal>/_mixins/`).
- Any other target, after resolving `..` and symlinks, fails:
  `personas/liveinsurer/guest.yaml: extends "../marketsite/guest.yaml" leaves the allowed folders (personas/_mixins, personas/liveinsurer)`.
- `personas/<portal>/_mixins/` is never searched for personas (folders starting with `_` are
  skipped, as in spec 001).

## Effective config additions

`EffectiveConfig` gains `ruleSet` (built-in rules extended by the portal's `action_rules`) and
`robots: { productToken, pageRequests }`. Consumers read these instead of module constants.
