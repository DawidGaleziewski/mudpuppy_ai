# Data Model: Legacy Proving Ground, Credential Vault, Quality Gates and Evals

## SQLite: migration `0007_credentials` (per-environment store `data/db/<env>.sqlite`)

```sql
CREATE TABLE credentials (
  id          TEXT PRIMARY KEY,                                   -- UUIDv7
  portal_id   TEXT NOT NULL CHECK (length(portal_id) > 0),        -- config id; portals are files, no FK
  environment TEXT NOT NULL CHECK (environment IN ('sandbox','staging','production')),
  ref_name    TEXT NOT NULL CHECK (ref_name GLOB '[A-Za-z_]*' AND length(ref_name) <= 64),
  ciphertext  BLOB NOT NULL,                                      -- AES-256-GCM ciphertext || 16-byte tag
  nonce       BLOB NOT NULL CHECK (length(nonce) = 12),
  key_id      TEXT NOT NULL CHECK (length(key_id) = 8),           -- first 8 hex of sha256(key)
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (portal_id, environment, ref_name)
) STRICT;
```

- `environment` is stored even though the file is per environment. A row copied into another
  environment's store then fails AAD decryption (AAD = `portal_id|environment|ref_name`) and the
  environment check.
- `down`: `DROP TABLE credentials;`.
- Never joined, exported (`portal:export`), shown in the dashboard or deleted by `portal:delete`
  (portal delete removes crawl data; credentials are removed with `pnpm vault delete`). Open
  question Q4.

## Run state (memory only, `RunState`)

| Field | Meaning |
|---|---|
| `secrets: Record<authField, string>` | resolved at `start_run`; never serialised |
| `redactor` | `createRedactor()` holding every resolved value |
| `login: { status: 'none' \| 'logged_in' \| 'blocked'; at?: number }` | lockout guard and re-login trigger |

## Decision-log entries (existing table `decision_log`, no new kinds)

As built: `decision_log.kind` has a CHECK constraint, so a new kind would need a table rebuild.
The new events are therefore `kind = 'note'` entries told apart by `rule`:

| rule | detail |
|---|---|
| `login` | `{ outcome, reason }` |
| `relogin` | `{ from_url, to_url }`, or `{ from_url, outcome, reason }` when the re-login failed |
| `handoff:captcha` | `{ kind: 'captcha', marker, route_template }` |
| `pw_trace:login_masked` | none: runs with vault credentials record their Playwright trace with every login left out (the open chunk is saved as `<seq>-<tool>.before-login.zip`, a new one starts after the login, and the login fields are cleared first), because DOM snapshots keep typed input values (FR-019a) |

The trace (`trace_spans`) gains the phases `resolve_credentials`, `login`, `relogin` and the
events `handoff`, `login`, `relogin`.

## Config (Zod, `@pathfinder/config`)

- `PortalConfig.login?: LoginSpec` as in `contracts/login-tool.md`.
- `PersonaConfig.auth` is unchanged.

## Ground truth v2

See `contracts/ground-truth-v2.md`. New: `screens[].actor`, `screens[].obstacles`, `users[]`,
`redirects[]`, `obstacles[]`.

## Catalogue row (`docs/legacy-obstacles.md`, parsed by the gates)

`| ID | Obstacle | Proving ground | Pathfinder should | Source | Status |`. The id matches `LO-\d{2,}`.
The status is one of `proposed`, `in scope`, `later` or `withdrawn`. Parsed by
`gates/src/catalogue.ts` (pure, unit-tested).

## Eval files (JSON on disk, Zod `EvalResult` in `@pathfinder/gates`)

`data/evals/<portal>/<timestamp>.json`, `baseline.json`, `tolerances.json`, `history/*.json`.
For the shape, see `contracts/gates-evals.md`. These files are committed (eval history is a
project record), like the golden exports.

## Proving-ground store (memory, Python)

`Store` holds `products`, `carts[session]`, `orders`, `accounts`, `transfers`, `statements`,
`policies`, `claims[session]` (wizard state), `failed_logins[user]`, `sessions[id] → {user,
brand, last_seen}`. Seeded from `backend/src/proving_ground/seed/*.json` and the users file.
`reset()` deep-copies the seed back.
