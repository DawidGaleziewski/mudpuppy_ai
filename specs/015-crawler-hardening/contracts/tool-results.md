# Contract: crawler tool results (spec 015)

No new MCP tools and no new inputs (FR-012). The results of `navigate`, `act` and
`get_next_frontier_item` change only by adding optional fields; the agent and the gates read them.

## `actions[]` entries (navigate/act result)

```jsonc
{
  "action_id": "act_…",
  "role": "generic",                 // signal-found: no ARIA role
  "accessible_name": "Dodaj do koszyka",
  "safety_class": "mutating",
  "allowed": true,
  "found_by": ["listener", "cursor"], // NEW, only on signal-found actions
  "frame": "0"                        // NEW, only on actions inside a frame
}
```

## Page result

```jsonc
{
  "state_id": "…",
  "frames": 2,                        // NEW, observed frames (omitted when 0)
  "mounts_pending": ["#root"]         // NEW, only when a mount stayed empty after the wait
}
```

## `act` errors

Unchanged codes. A signal-found or framed locator that resolves to 0 or more than 1 element emits
the existing `locator` event with `outcome: 'absent' | 'ambiguous'` and the tool returns the
existing error; it never clicks a guess.

## Portal config (`portals/<portal>/portal.yaml`)

```yaml
scope:
  # … existing budgets and domains …
  mfe_wait_ms: 10000      # NEW, optional, 0..60000
  frame_depth: 3          # NEW, optional, 0..5 (0 = top document only)
```
