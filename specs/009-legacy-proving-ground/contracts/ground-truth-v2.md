# Contract: ground truth v2

A superset of spec 004's `contracts/ground-truth.md`: every v1 file stays valid. The schema stays in
`@pathfinder/reference-portal/src/ground-truth.ts`; the evaluator in `@pathfinder/docs` declares its
own compatible input type.

Files: `apps/proving-ground/ground-truth/{shop,bank,insurer}.json`, with `portal_id`
`proving-ground-shop`, `proving-ground-bank` and `proving-ground-insurer`.

## New optional fields

```jsonc
{
  "screens": [{
    "id": "S05", "route_template": "/bank/przelew", "title": "Przelew krajowy",
    "guest_visible": false, "reached_by": "login",
    "actor": "bank-client",            // NEW, default "guest"; a `users[].id`
    "obstacles": ["LO-10", "LO-11"]    // NEW, catalogue ids reproduced on this screen
  }],
  "users": [                           // NEW, never passwords
    { "id": "bank-client", "persona": "client", "refs": ["PG_BANK_LOGIN", "PG_BANK_PASSWORD"] }
  ],
  "redirects": [                       // NEW
    { "id": "D01", "from": "/polisa.php?id=7", "to": "/ubezpieczenia#/polisy/7",
      "kind": "chain", "hops": ["meta_refresh", "js_location"] }
  ],
  "obstacles": [                       // NEW, one per catalogue id present in this domain
    { "id": "LO-37", "screens": ["S07"], "markers": ["CAPTCHA", "nie jestem robotem"],
      "expected": "handoff" }          // handoff | documented | ignored | navigated
  ]
}
```

## Validation (superRefine)

- `screens[].actor` must be `guest` or a `users[].id`; `guest_visible` must be `true` exactly
  when `actor` is `guest`.
- Every `screens[].obstacles` id must appear in `obstacles[]` and in `docs/legacy-obstacles.md`
  with status `in scope` (checked by the self-check, not the schema).
- `obstacles[].screens` must be known screen ids.
- `redirects[].id` uses the `D` prefix and is unique with all the other ids.

## Evaluator categories (FR-027)

| Category | A ground-truth item counts as found when |
|---|---|
| `obstacles` | `expected: handoff`: a hand-off open question exists for one of its screens. `documented`: a record citing one of its screens contains one of `markers`. `ignored`: no state was recorded for the overlay. `navigated`: the screens behind it were recorded |
| `logged_in_screens` | a screen with `actor ≠ guest` is matched like any screen |
| `entry_points` | a redirect's `from` route is cited in a record of its `to` screen, or a recorded edge connects them |

## Self-check (`pnpm gt:check` in apps/crawler, also part of the gates)

As built (`gates/tests/ground-truth.test.ts`): check 4 asserts that every obstacle id is `in
scope` in the catalogue; the markers are phrases a BA record would contain, not page text.
Screens reached only by a mutation are skipped, and so are fields that render only after a step
(cart quantity, parcel locker, wizard step 2).

With the estate running, as each screen's actor:

1. Every screen's route loads with HTTP status < 400, and its title text is present.
2. Every form field's label (or placeholder for unlabeled ones) is present.
3. No `guest_observable: false` rule's `claim_markers` appear on any guest page.
4. Every obstacle's markers are present on its screens.
5. Every redirect resolves to its `to`.
