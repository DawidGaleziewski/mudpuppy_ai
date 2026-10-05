# Proving ground

A deliberately awkward "legacy estate" (shop, bank, insurer, legacy pages) used to prove
the crawler and BA agent against known obstacles. Django backend (no ORM) plus five
Vite/React micro-frontends (`web/shell`, `web/mfe-*`). The fictional group is Grupa Mokradło
with three brands: Mokradło Sklep, Mokradło Bank and Mokradło Ubezpieczenia. All texts are Polish.
Its data is disposable.

## Start

```sh
pnpm install
pnpm start        # builds the web apps, then runs `uv run --project backend proving-ground`
```

Ports: **4100** serves everything except the widget host; **4101** is the cross-origin
widget host (`/widget/*` only). Health check: `GET /healthz` returns `ok`.

Flags (after `pnpm start`, for example `pnpm start --session-timeout 20`):

| Flag | Default | Meaning |
|---|---|---|
| `--host` | `127.0.0.1` | Bind address |
| `--port` | `4100` | Main port |
| `--widget-port` | `4101` | Widget host port |
| `--session-timeout <s>` | `300` | Idle seconds before a session expires |
| `--cms-delay-ms <n>` | `400` | Delay of the CMS text files |
| `--seed-users <file>` | `backend/var/users.local.json` | File with the test users (login and password hash) |

`pnpm start` rebuilds only the web apps whose sources are newer than their bundle.

## Users and seeding

Three test users exist: `shop-client`, `bank-client` and `insurer-client`. Passwords are not
in the repository. Generate them with the vault (run in `apps/crawler`):

```sh
pnpm vault generate proving-ground-bank --login PG_BANK_LOGIN=jan.testowy --password PG_BANK_PASSWORD \
  --seed ../proving-ground/backend/var/users.local.json --seed-user bank-client
```

The same for `proving-ground-shop` (`klient.sklep`, `shop-client`) and `proving-ground-insurer`
(`ewa.polisowa`, `insurer-client`). The vault stores the password encrypted and writes only its hash
to the seed file, which is git-ignored. To log in by hand:
`pnpm vault reveal proving-ground-bank PG_BANK_PASSWORD --yes-print-secret`.

The starting data (products, accounts, policies) is in `backend/src/proving_ground/seed/`.

## Reset

`curl -X POST http://127.0.0.1:4100/__admin/reset` re-seeds the store: carts, orders, transfers,
claims, lockouts and sessions. Use it after a locked account (three wrong passwords).
`/__admin/` is disallowed in `robots.txt`.

## CMS

Modern screens read their texts from `/cms/<domain>/pl.json` (domains `shell`, `shop`, `bank`,
`insurer`), delayed by `--cms-delay-ms`. The source files are in `cms/<domain>/pl.json`. One key in
the shop cart is missing on purpose, so the raw key shows.

## Ground truth and obstacle catalogue

- Ground truth, one file per brand: `ground-truth/{shop,bank,insurer}.json`. The evaluator scores the
  BA's documentation against them (`pnpm eval proving-ground-bank`).
- Obstacle catalogue: `docs/legacy-obstacles.md`. Each `LO-` entry names the route and the
  ground-truth screen that reproduces it.

## Gates

The quality gates (`apps/crawler/packages/gates`, part of `pnpm test` in `apps/crawler`) start their
own copy of the estate on ports **4200** and **4201**, with `--session-timeout 5`, `--cms-delay-ms 200`
and a fixture user file. Stop anything on those ports before running the tests. Your copy on 4100 is
not touched.

## Tests

Backend: `cd backend && uv run pytest && uv run ruff check`.

Contract: `specs/009-legacy-proving-ground/contracts/estate.md`.
