# Quickstart: validate spec 009

## Prerequisites

- `pnpm install` in `apps/crawler` and `apps/proving-ground`; `uv sync` in
  `apps/proving-ground/backend`; Playwright Chromium installed.
- A Claude Code CLI on PATH, for tier 2 only.

## R-25: the estate

1. Generate the test users (creates the vault key on first use):
   ```sh
   cd apps/crawler
   pnpm vault generate proving-ground-bank --login PG_BANK_LOGIN=jan.testowy --password PG_BANK_PASSWORD \
     --seed ../proving-ground/backend/var/users.local.json --seed-user bank-client
   # same for proving-ground-shop (klient.sklep, shop-client) and proving-ground-insurer (ewa.polisowa, insurer-client)
   ```
2. `pnpm --dir apps/proving-ground start`, then open http://127.0.0.1:4100/. Expect the home page
   with three tiles and the cookie banner.
3. Walk the shop as a guest: catalogue → product → `Dodaj do koszyka` (the header cart says
   `Koszyk (1)`) → cart → checkout, where the CAPTCHA widget is shown.
4. `pnpm vault reveal proving-ground-bank PG_BANK_PASSWORD --yes-print-secret`, then log in to
   the bank. Check the transfer form, the statements and Historia operacji (the frameset inside an
   iframe).
5. Enter a wrong password three times. Expect `Konto zostało zablokowane…`, then run
   `curl -X POST http://127.0.0.1:4100/__admin/reset` and log in again.
6. `cd apps/crawler && pnpm gt:check` (the ground-truth self-check; it starts its own estate on the
   gate ports 4200/4201). Expect every case to pass.

## R-26: vault and login

1. `pnpm vault list`: names only. Then
   `sqlite3 data/db/sandbox.sqlite "select hex(ciphertext) from credentials"` shows no plaintext.
2. Ask the crawler agent to map `proving-ground-bank` as `client`. Expect a `login` call with
   `outcome: logged_in`, logged-in states, and a `relogin` decision after the 5-minute idle
   timeout (or start the estate with `--session-timeout 20`).
3. Search for the password: run
   `grep -r "$(pnpm -s vault reveal proving-ground-bank PG_BANK_PASSWORD --yes-print-secret)" data/`.
   Expect no hits.
4. Map `proving-ground-shop` as `guest`. Expect an open question
   `Human needed: CAPTCHA on /sklep/zamowienie`, and the run finishing with the rest of the shop
   mapped.

## R-27: gates and evals

1. `cd apps/crawler && pnpm test`. The gates run within it, and `data/gates/report.json` lists
   every in-scope `LO-` id as passed.
2. Sabotage check: make the fingerprint keep class names, then run
   `pnpm vitest run --project gates`. Expect a failure naming LO-13. Revert the change.
3. Run `pnpm eval reference-insurer --budget-usd 5`, then the same command with `--promote`, then
   `pnpm eval reference-insurer` again. Expect a comparison table with no regression.
4. `pnpm eval proving-ground-bank --persona client`. Expect a report with `obstacles`,
   `logged_in_screens`, `relogins`, and the cost.
