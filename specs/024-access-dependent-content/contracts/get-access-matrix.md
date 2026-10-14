# Contract: `get_access_matrix` (pathfinder-ba, read-only) and the dashboard read model

Spec 024 US2. The BA tool (`apps/crawler/packages/mcp-server/src/services/ba/access.ts`) and the
dashboard (`apps/dashboard/src/pathfinder_dashboard/queries_access.py`) return the same model. Both
are checked against `apps/crawler/tests/fixtures/access/three-personas.json` (`expected`).

## Input

`{ portal_id: string, screen_id?: string }`: the whole portal, or one screen.

## Output

```jsonc
{
  "portal_id": "access-shop",
  "personas": ["b2b", "basic", "guest", "premium"],      // every persona with a run of the portal
  "persona_attributes": { "b2b": { "tariff": "premium", "contract": "B2B" } }, // BA tool only: from each persona's newest run snapshot
  "screens": [                                            // screens with an observation, by route, title, id
    {
      "screen_id": "sc-home", "route": "/", "title": "Home",
      "depends_on_access": true,                          // an element below, or not_reached is not empty
      "variants": [                                       // per persona that reached it: its newest observed state
        { "persona_id": "basic", "state_id": "st-home-1", "run_id": "run-basic",
          "observed_at": "…", "complete_map_run": true }  // reached it in a completed map run
      ],
      "not_reached": [],                                  // personas with a completed map run that never got here
      "elements_total": 3,                                // distinct element keys over all variants
      "elements": [                                       // only the access-dependent ones
        { "key": "button \"Export\"", "seen_by": ["b2b", "premium"], "not_seen_by": ["basic"] }
      ]
    }
  ]
}
```

## Rules

- Element key: `role "accessible name"`, the role alone when unnamed (from `actions`).
- `seen_by`: personas whose variant has the key. `not_seen_by`: personas whose variant lacks it and
  that reached the screen in a completed map run (an interrupted run shows nothing missing).
- Lists are in code-point order on both sides.
- An unknown portal answers `personas: [], screens: []` (and `persona_attributes: {}`), not an error.
- Content differences under the same key (a price) are not access differences; a renamed element
  shows as two keys (seen / not seen). The diff view (US3.1) is later work.
