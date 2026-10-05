# Contract: portal `login` block, persona auth, `login` tool, re-login, CAPTCHA hand-off

## Portal config (`portals/<p>/portal.yaml`), new optional block

```yaml
login:
  url: /logowanie?marka=bank&next=/bank/pulpit
  username: { label: "Login", placeholder: "Login", css: "input[name=login]" }  # first match wins: label, placeholder, css
  password: { label: "Hasło", placeholder: "Hasło", css: "input[name=haslo]" }
  submit:   { role: button, name: "Zaloguj", css: "button[type=submit]" }
  success:  { url_not_matching: "/logowanie" }          # and/or `text: "Wyloguj"`
  failure:  { text: ["Nieprawidłowy login lub hasło.", "Konto zostało zablokowane"] }
  expiry:   { url_matching: "/logowanie", text: ["Sesja wygasła"] }
  fields:   { username: login, password: password }     # persona auth keys used for each control
```

Zod-validated: at least one locator for each control; `success` needs `url_not_matching` or `text`.

## Persona

```yaml
auth:
  login: ref:PG_BANK_LOGIN
  password: ref:PG_BANK_PASSWORD
```

This is unchanged from FR-017 of spec 001 (only `ref:` values). New: `start_run` resolves every
ref against the vault for `(portal_id, db environment)`. A missing ref gives
`CONFIG_INVALID: missing credential refs: PG_BANK_PASSWORD (run "pnpm vault check …")` before
the browser opens. A persona with refs on a portal without a `login` block is refused with
`CONFIG_INVALID: persona has credentials but portal has no login block`.

## Agent tool `login`

```text
login { run_id, rationale }
→ { outcome: "logged_in", state_id, url }                       # the landing page is recorded like a navigation
→ { outcome: "failed", reason: "rejected" | "captcha" | "locked" | "control_not_found", state_id }
errors: LOGIN_NOT_CONFIGURED, LOGIN_BLOCKED (an earlier failure in this run), PRODUCTION_REFUSED
```

- The values never appear in the tool result, the action records, the trace spans or the logs.
  As built (review session, FR-019a): the Playwright trace stops before every login, explicit or
  re-login inside another call, and a new chunk starts after it, with the login fields cleared
  (decision `pw_trace:login_masked`). The part before the login is kept as
  `<seq>-<tool>.before-login.zip`. If that chunk cannot be closed, tracing stops for the run.
  Pausing is not enough on its own (F-15: snapshots carry the document's login POST): every
  saved chunk is rewritten with the redactor applied to its entries, and a chunk that cannot be
  cleaned is deleted.
- `reason: "captcha"`: the login showed the widget; the run is marked `login_blocked`.
  `reason: "unknown"` carries `at` (the shaped route the browser ended on).
- Decision-log entries (as built, `kind = note`, told apart by `rule`; `decision_log.kind` has a
  CHECK): `login` {outcome, reason}, `relogin` {from_url, to_url} or {from_url, outcome, reason, at}.

## Re-login (automatic, server side)

After every observed page on a run with a successful login: if the `expiry` signs match, the
server logs in once and navigates back to the URL it was going to. It then records a decision
`relogin`, and the original tool call returns the target state with `relogged_in: true`. If the
re-login fails, the call returns the error `SESSION_LOST`, and the run is `login_blocked`.

## CAPTCHA hand-off (sandbox / staging)

When the block detector reports `captcha` on a page:

- production: unchanged (`BLOCKED`, the run stops with a warning);
- otherwise: the state is recorded; a decision `handoff` {kind: `captcha`, url}; an open question
  `Human needed: CAPTCHA on <route template>. The crawler does not solve CAPTCHAs.` about the
  state; actions whose element lies inside the CAPTCHA container are issued with
  `allowed: false, skip_reason: "captcha_handoff"`; the frontier continues.
