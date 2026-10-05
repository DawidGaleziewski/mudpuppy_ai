# Contract: the proving-ground estate

Fictional Polish group **Grupa Mokradło** with three brands: **Mokradło Sklep** (shop),
**Mokradło Bank** (bank), **Mokradło Ubezpieczenia** (insurer). All texts are Polish. Ids in
brackets are `docs/legacy-obstacles.md` entries reproduced at that place.

## Processes and ports

| Port | Serves |
|---|---|
| 4100 | everything except the widget host (shell, apps, API, legacy, CMS, admin) |
| 4101 | cross-origin widget host: `/widget/*` only (claim upload, CAPTCHA frames) [LO-03] |

Start: `pnpm --dir apps/proving-ground start`, which builds stale web apps and then runs
`uv run proving-ground`. Flags: `--port`, `--widget-port`, `--session-timeout <s>` (default 300),
`--cms-delay-ms <n>` (default 400), `--seed-users <file>`. Health: `GET /healthz` → `ok`.

## Shared endpoints (port 4100)

| Method | Path | Purpose |
|---|---|---|
| GET | `/robots.txt` | `User-agent: *` / `Disallow: /__admin/` |
| POST | `/__admin/reset` | Re-seed the store: carts, orders, transfers, claims, lockouts, sessions [FR-007] |
| GET | `/cms/<domain>/pl.json` | CMS texts, delayed by `--cms-delay-ms` [LO-07]; domains `shell`, `shop`, `bank`, `insurer` |
| GET | `/mfe/import-map.json` | `{ "shop": "/mfe/shop/index.js", "bank": …, "insurer": …, "cookies": … }` |
| GET | `/mfe/<name>/*` | Built bundles of each front-end app |
| GET | `/api/clock` | `{ "today": "2026-03-16" }`: the estate's fixed date [LO-50] |
| GET | `/api/session` | `{ user, domain, expires_in }` or 401 |
| GET/POST | `/logowanie?marka=<shop\|bank\|insurer>&next=<path>` | Login (shell page + `POST /api/login`) |
| POST | `/api/login` | form `login`, `haslo`, `csrf`, optional `captcha_token` → 302 to `next` or 200 with error |
| POST | `/api/logout` | Ends the session |

**Login rules** [LO-30, LO-31, LO-37]: a CSRF token in a hidden field, issued with the page. A
failure shows `Nieprawidłowy login lub hasło.`. After the first failure the CAPTCHA widget is
required. After the third failure for the same user: `Konto zostało zablokowane. Skontaktuj się z
infolinią.`, until reset. The login page is one shell component with texts per brand from CMS
[LO-09]. Bank and insurer login inputs have no `<label>`; they have a placeholder only [LO-11].

**Session** [LO-32]: idle timeout `--session-timeout`. On expiry, API calls return 401 and the
shell shows a modal `Sesja wygasła. Zaloguj się ponownie.` with button `Zaloguj`, which leads to
`/logowanie?marka=…&next=<current>`. A full page load of a protected route after expiry gets a
302 to the same login URL.

## Shell (React SPA, all non-legacy routes)

- Header: brand tiles, a mini-cart custom element `<mk-mini-cart>` with an open shadow root
  showing `Koszyk (n)` [LO-05]. It listens to `pg:cart-changed` [LO-34].
- Cookie banner: its own front-end app (`cookies`), an overlay with `Akceptuję wszystkie` /
  `Tylko niezbędne`; the choice is stored in `localStorage` [LO-38].
- `/` home page: three tiles `Sklep`, `Bank`, `Ubezpieczenia` and footer links.
- Each brand route mounts its app from the import map [LO-01]. If the app fails to load, the
  shell shows `Moduł chwilowo niedostępny.` in its place (edge case).
- All class names in the modern parts are hashed CSS-module names plus utility soup, for example
  `css-8f3k2a _x1 mk-btn--primary__z9`, changed on every build [LO-13].
- Styling: the dashboard's Console tokens (colours, type) for the modern parts.

## Shop app (`/sklep…`, history routing, guest unless marked)

| Route | Screen | Notes |
|---|---|---|
| `/sklep` | Katalog | Filters: category (custom dropdown [LO-18]), price from/to; sort; icon-only filter toggle without a name [LO-15]; A/B hero banner variant `A`/`B` per session [LO-35]; newsletter modal after 3 s, `Nie, dziękuję` closes it [LO-39] |
| `/sklep?strona=n` | Katalog (page n) | `Następna strona` is always shown; past the last page it shows an empty list [LO-26] |
| `/sklep/produkt/<slug>` | Produkt | `Dodaj do koszyka` is a `div` with onClick [LO-10]; data from `POST /api/shop/graphql` (operations `Catalog`, `Product`, `AddToCart`, `Cart`) [LO-42] |
| `/sklep/koszyk` | Koszyk | Quantity change, remove; `Darmowa dostawa od 200,00 zł` appears only once the total is ≥ 200 zł [LO-51]; one label renders the raw CMS key `checkout.summary.vatNote` [LO-08] |
| `/sklep/zamowienie` | Zamówienie | Name, e-mail, `Kod pocztowy` (`00-000`) [LO-49], `Miasto` → parcel lockers loaded by `GET /api/shop/lockers?miasto=` [LO-48], payment method radio; CAPTCHA widget before `Zamawiam i płacę` [LO-37] |
| `/sklep/zamowienie/potwierdzenie` | Potwierdzenie zamówienia | Reached after submit only |
| `/sklep/konto` | Moje konto (actor `shop-client`) | Orders list; requires login |
| `/shop/index.php?cat=<n>` | — | 301 → `/old/kategoria/<n>` → 302 → `/sklep?kategoria=<n>` [LO-21] |

Shop rules (ground truth): free delivery threshold 200 zł; quantity 1–10; postal code
`\d{2}-\d{3}`; e-mail required; a parcel locker is required when `Paczkomat` delivery is chosen.

## Bank app (`/bank…`)

| Route | Screen | Actor | Notes |
|---|---|---|---|
| `/bank` | Bank: strona główna | guest | Rates banner as an image with text baked in [LO-16]; `Zaloguj do bankowości`; chat widget iframe bottom right [LO-40] |
| `/bank/pulpit` | Pulpit | bank-client | Accounts with balances; rates ticker over SSE `GET /api/bank/ticker` updating every 2 s [LO-44] |
| `/bank/przelew` | Przelew krajowy | bank-client | Inputs with placeholder only (`Numer rachunku`, `Kwota`, `Tytuł`) [LO-11]; IBAN checksum; amount with decimal comma, 0,01–20 000,00 zł [LO-49]; `Wykonaj` is a `div` [LO-10] |
| `/bank/przelew/potwierdzenie` | Potwierdzenie przelewu | bank-client | Reached after submit |
| `/bank/wyciagi?miesiac=YYYY-MM` | Wyciągi | bank-client | `Poprzedni miesiąc` has no lower bound [LO-26]; `Pobierz PDF` downloads `wyciag-YYYY-MM.pdf` [LO-28] |
| `/bank/historia` | Historia operacji (wrapper) | bank-client | iframe of `/legacy/bank/historia.do;jsessionid=<sid>` [LO-02, LO-24] |

Bank rules: transfer amount range, IBAN format and checksum, title max 140 characters,
transfers after 22:00 are booked the next working day (estate clock), daily limit 20 000 zł.
As built, the time of day comes from the request header `X-PG-Clock-Time` (HH:MM, default
12:00); the UI never sends it, so only tests and scripted calls reach the after-22:00 rule.

## Insurer app (`/ubezpieczenia…`, hash routing [LO-06])

| Route | Screen | Actor | Notes |
|---|---|---|---|
| `/ubezpieczenia` | Ubezpieczenia: strona główna | guest | `Ogólne warunki ubezpieczenia` opens with `window.open` [LO-27]; `Porównaj oferty` shows `Trwa wyliczanie składki…` forever [LO-45] |
| `/ubezpieczenia#/polisy` | Moje polisy | insurer-client | List |
| `/ubezpieczenia#/polisy/<nr>` | Szczegóły polisy | insurer-client | `Pobierz polisę (PDF)` [LO-28] |
| `/polisa.php?id=<nr>` | — | — | `Proszę czekać…` page with meta refresh after 1 s → `/stare/polisa/<nr>` → JS `location.replace` → `/ubezpieczenia#/polisy/<nr>` [LO-21, LO-22, LO-23] |
| `/ubezpieczenia#/polisy/<nr>/dodatki` | Dodatki do polisy | insurer-client | Custom date picker `Data rozpoczęcia` [LO-18]; `Assistance Premium` is available only when the sum insured is ≥ 50 000 zł [LO-51] |
| `/ubezpieczenia#/szkody/nowa` | Zgłoszenie szkody (3 steps) | insurer-client | Server-held wizard state; the text `Nie używaj przycisku Wstecz przeglądarki.`; Back resets the wizard to step 1 [LO-33]; `Data zdarzenia`: the client accepts any date, the server rejects dates older than 30 days before the estate clock [LO-47]; step 2 has the upload iframe from port 4101 [LO-03] |
| `/ubezpieczenia#/szkody/potwierdzenie` | Szkoda zgłoszona | insurer-client | After submit |

## Legacy app (`/legacy/…`, server-rendered, deliberately bad)

| Route | Notes |
|---|---|
| `/legacy/bank/historia.do;jsessionid=<sid>` | `<frameset cols="180,*">` [LO-04] with `menu.do` and `lista.do` |
| `/legacy/bank/menu.do` | `<a href="javascript:void(0)" onclick="__doPostBack('lista','')">` links [LO-17, LO-25] |
| `/legacy/bank/lista.do` (POST with `__VIEWSTATE`) | Layout tables [LO-12], duplicate `id="row"` [LO-14], print icon `<img src=print.gif>` without alt [LO-15], unclosed `<td>` and nested `<form>` [LO-19] |
| `/legacy/bank/szczegoly.do` | Served as `windows-1250` with `ą ę ł ż ś ć ń ó ź` in the text [LO-20] |
| `/legacy/bank/archiwum.do` | Dead link target: 404 page `Strona nie istnieje` [LO-29] |
| `/legacy/bank/raport.do` | 500 page `Wystąpił błąd aplikacji (kod 0x1F)` [LO-29] |
| `/legacy/insurer/szkoda-stara.do` | Classic form POST + 302 redirect, with no XHR [LO-43] |

Legacy markup has no ARIA roles, no labels, inline styles, `<font>`, a fixed width of 760 px,
and the `MS Sans Serif`/Verdana font stack.

## Rate limiting [LO-41]

More than 30 requests in one second from one session returns `429` with `Retry-After: 1`. The
crawler's normal 5 rps never trips it; the gate trips it on purpose.

## Test users

| User id | Brand | Login | Persona | Vault refs |
|---|---|---|---|---|
| `shop-client` | shop | `klient.sklep` | `proving-ground-shop/client` | `PG_SHOP_LOGIN`, `PG_SHOP_PASSWORD` |
| `bank-client` | bank | `jan.testowy` | `proving-ground-bank/client` | `PG_BANK_LOGIN`, `PG_BANK_PASSWORD` |
| `insurer-client` | insurer | `ewa.polisowa` | `proving-ground-insurer/client` | `PG_INSURER_LOGIN`, `PG_INSURER_PASSWORD` |

Passwords are generated by `pnpm vault generate`. The estate reads only their hashes from
`backend/var/users.local.json` (gitignored). For tests without a vault, `--seed-users` may point
at a fixture file with a known throwaway password (`test-password-not-real`).
