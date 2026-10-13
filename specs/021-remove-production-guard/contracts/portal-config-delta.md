# Contract delta: portal config and run start (spec 021)

## Portal file

- `environment: production | staging | sandbox` — a label only. No address check, no extra
  required keys.
- `max_action_class` (top level or per environment) — optional; omitted means no limit. A
  persona's `max_action_class` can still only lower it.
- `rate_limit` — optional on every environment.

## `start_run`

- No longer refuses with `ENV_GUARD_REFUSED` (production-looking address, placeholder User-Agent).
  `CONFIG_INVALID` refusals are unchanged.

## During a run

- A CAPTCHA on any environment: decision note `handoff:captcha` + open question, the crawl goes on.
  No `RUN_STOPPED` for a CAPTCHA.
- A Playwright trace chunk is stored for every browser call on every environment.
