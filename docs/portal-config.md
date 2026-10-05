# Portal configs

One folder per portal with a `portal.yaml`, validated by `@pathfinder/config` (`portal-schema.ts`).
Personas live in `personas/<portal>/`.

- `id`, `base_url`, `environment` (`production` | `staging` | `sandbox`), `max_action_class` (ceiling; default `read`).
- `compliance`: `robots_checked_on`, `terms_reviewed_on`, `terms_reviewed_by`.
- `scope`: `allowed_domains`, `allowed_paths`, `external_link_policy`, and the budgets (`max_depth`, `max_states`, `max_actions_per_state`, `max_run_time_minutes`, `max_steps`).
- `denylist`: rule ids, `path:<glob>` or `url:<glob>`; `action_rules`: the portal's own safety rules.
- `rate_limit`: `requests_per_second`, `max_concurrency`, `user_agent` (required for production).
- `obstacles`: list of `{id, selector}` overlays the crawler dismisses (cookie banner, modals).
- `login` (optional, needed by any persona with `ref:` credentials): `url`, `username`, `password`, `submit`, `success`, `failure`, `expiry`, `fields`. Full contract: `specs/009-legacy-proving-ground/contracts/login-tool.md`.
- Also: `block_signatures`, `item_view_cap`, `item_route_templates`, `robots_page_requests`, `pii_scrub`.
