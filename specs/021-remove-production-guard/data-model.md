# Data model: spec 021

No table or column changes.

| Item | Before | After |
|---|---|---|
| Portal / environment `max_action_class` (omitted) | `read` | `external-side-effect` (no limit) |
| Portal `rate_limit` on `environment: production` | required | optional, as elsewhere |
| Trace boot `pw_trace` mode | `non_production` (default) or `all` | new runs `all`; `non_production` still parses for old runs |
| Error codes | `PRODUCTION_REFUSED`, `ENV_GUARD_REFUSED` | both removed |
