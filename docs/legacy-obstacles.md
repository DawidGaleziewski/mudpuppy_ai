# Legacy obstacles

A living catalogue of things that make legacy portals hard to map and document: odd architecture,
broken markup, unusual navigation, sessions, bot checks, network quirks and data rules. Each entry
says where the legacy proving ground (spec 009, R-25) reproduces it and what Pathfinder is
expected to do. The quality gates (R-27) hold one assertion set per entry.

**Adding an entry**: when a real project shows a new obstacle, add a row with the next free id,
the source (project or finding id), and leave "Proving ground" as `not yet` until a screen
reproduces it. Ids are never reused; a dropped entry is marked `withdrawn`, not deleted.

Status: `proposed` (not yet rated), `in scope`, `later`, `withdrawn`. Whether Pathfinder handles an
entry is shown by its gate (`gate()` handled, `gap()` known gap) in the gate report, not here.
Handled by spec 015 (R-28): LO-02, LO-04, LO-10, LO-11, LO-18, LO-34, LO-43. The first set (LO-01..LO-51)
was put in scope by an overnight default on 2026-10-05 (all but LO-36 and LO-46); the user may
re-rate it.
Source: `idea` = user raw idea (`user_input/more_testing_and_test_portals.md`), `F-xx` = a logged
finding (spec 004 `goal-run-findings.md` / spec 008 `findings.md`), `common` = typical in legacy
migrations.

"Proving ground" cells name domain, route and ground-truth screen id (`apps/proving-ground/ground-truth/{shop,bank,insurer}.json`).
Screen ids are per domain: `shop S03` is screen S03 in `shop.json`.

## Architecture

| ID | Obstacle | Proving ground | Pathfinder should | Source | Status |
|---|---|---|---|---|---|
| LO-01 | Micro-frontends mounted by a shell, each its own bundle and release | Shell mounts one bundle per brand from `/mfe/import-map.json`: shop `/sklep…` (shop S01–S06), bank `/bank…` (bank S01, S03–S07), insurer `/ubezpieczenia…` (insurer S01, S03–S07) | Map one state graph across micro-frontends; a micro-frontend reload is not a new state | idea | in scope |
| LO-02 | Legacy server-rendered app wrapped in an iframe inside the new shell | Bank `/bank/historia` (bank S07): iframe of the old app `/legacy/bank/historia.do` (bank S08) | Observe and act inside the iframe; record the wrapper and the inner page as one screen | idea | in scope |
| LO-03 | Cross-origin iframe (other port) inside a page | Insurer `/ubezpieczenia#/szkody/nowa`, step 2 (insurer S06): upload widget served from the widget port 4101 | Record it as embedded; act in it only when its origin is in scope | common | in scope |
| LO-04 | `<frameset>` / `<frame>` layout | Bank `/legacy/bank/historia.do` (bank S08): menu frame `menu.do` (bank S09) and content frame `lista.do` (bank S10) | Treat the frameset as one screen; follow frame navigation | idea | in scope |
| LO-05 | Web component with shadow DOM | Shell header `<mk-mini-cart>` (open shadow root, `Koszyk (n)`) on every shell page: shop S01–S07, bank S01–S07, insurer S01–S07 | See and act on elements inside the shadow root | common | in scope |
| LO-06 | Hash routing (`#/…`) mixed with path routing | Insurer `/ubezpieczenia#/polisy…` and `#/szkody/…` (insurer S03–S07) | Route templates treat the hash route as the route | common | in scope |
| LO-07 | Labels fetched at runtime from CMS files (keys flash before text loads) | Every modern screen reads `/cms/<domain>/pl.json` (delayed): shop S01–S07, bank S01–S07, insurer S01–S07 | Wait for texts; record the real label, never the key | idea | in scope |
| LO-08 | Missing CMS key shows the raw key (`checkout.btn.pay`) | Shop `/sklep/koszyk` (shop S03): the key `checkout.summary.vatNote` has no CMS entry | Record what is shown; BA raises an open question | idea | in scope |
| LO-09 | White-label: same component, different labels per brand | One login component at `/logowanie?marka=<brand>`, texts per brand: shop S07, bank S02, insurer S02 | Keep screens apart per domain; same component is not the same screen | common | in scope |

## Markup and accessibility

| ID | Obstacle | Proving ground | Pathfinder should | Source | Status |
|---|---|---|---|---|---|
| LO-10 | `div`/`span` "buttons" with click handlers, no role, no tabindex | Shop `/sklep/produkt/:slug` "Dodaj do koszyka" (shop S02); bank `/bank/przelew` "Wykonaj" (bank S04) | Find clickable elements without ARIA roles and act on them | idea | in scope |
| LO-11 | Inputs without a label (placeholder only, or label in the next table cell) | Bank `/bank/przelew` (bank S04) and bank login (bank S02), insurer login (insurer S02): placeholder only; legacy insurer `/legacy/insurer/szkoda-stara.do` (insurer S08): label in the next table cell | Name fields from nearby text; BA marks the name as inferred | idea | in scope |
| LO-12 | Layout tables (forms and menus built from `<table>`) | Legacy bank `menu.do`, `lista.do`, `szczegoly.do` (bank S09–S11); legacy insurer `/legacy/insurer/szkoda-stara.do` (insurer S08) | Read fields and actions out of table layout | idea | in scope |
| LO-13 | Long generated CSS class names that change per build | Every modern screen (hashed CSS modules plus utility soup): shop S01–S07, bank S01–S07, insurer S01–S07 | Never use class names in locators or fingerprints | idea | in scope |
| LO-14 | Duplicate `id` attributes on one page | Legacy bank `/legacy/bank/lista.do` (bank S10): every operation row has `id="row"` | Locators do not rely on `id` uniqueness | common | in scope |
| LO-15 | Icon-only buttons / image buttons without alt text | Shop `/sklep` filter toggle (shop S01); legacy bank `/legacy/bank/lista.do` print icon `print.gif` (bank S10) | Record the action with a position-based name; BA raises a question | common | in scope |
| LO-16 | Text baked into images | Bank `/bank` rates banner `/api/bank/rates.png` (bank S01) | Record that text exists but is not readable; never guess it | common | in scope |
| LO-17 | `javascript:void(0)` links, `<a>` without `href`, `onclick` navigation | Legacy bank `/legacy/bank/menu.do` (bank S09) and `lista.do` (bank S10) | Treat them as actions, not links; follow the navigation they cause | common | in scope |
| LO-18 | Custom dropdowns and date pickers built from divs | Shop `/sklep` category and sort dropdowns (shop S01); insurer `/ubezpieczenia#/polisy/:nr/dodatki` date picker "Data rozpoczęcia" (insurer S05) | Operate the widget; record allowed values | common | in scope |
| LO-19 | Invalid HTML (unclosed tags, nested forms) | Legacy bank `/legacy/bank/lista.do` (bank S10): unclosed `<td>`, nested `<form>` | Parse what the browser renders; no crash | idea | in scope |
| LO-20 | Legacy page in `windows-1250` with Polish diacritics | Legacy bank `/legacy/bank/szczegoly.do` (bank S11) | Record correct Polish text (`ą`, `ł`, `ż`) | common | in scope |

## Navigation and URLs

| ID | Obstacle | Proving ground | Pathfinder should | Source | Status |
|---|---|---|---|---|---|
| LO-21 | Redirect chains (301 → 302 → page) | Shop `/shop/index.php?cat=:n` → `/old/kategoria/:n` → `/sklep?kategoria=:n` (shop S01, redirect D01); insurer `/polisa.php?id=:nr` → `/stare/polisa/:nr` → `/ubezpieczenia#/polisy/:nr` (insurer S04, redirect D01) | Record the final screen and the chain; no duplicate state | idea | in scope |
| LO-22 | Meta refresh and JavaScript `location` redirects | Insurer `/polisa.php?id=:nr` "Proszę czekać…" (meta refresh after 1 s) then `/stare/polisa/:nr` (`location.replace`), ending on insurer S04 (redirect D01) | Follow them; record the waiting page as transient | idea | in scope |
| LO-23 | Old and new URL schemes for the same screen | Insurer `/polisa.php?id=:nr` and `/ubezpieczenia#/polisy/:nr` (insurer S04, redirect D01) | Merge to one screen; record both entry points | idea | in scope |
| LO-24 | Session id in the URL (`;jsessionid=`, `?sid=`) | Legacy bank `/legacy/bank/*.do;jsessionid=<sid>`: bank S07 (iframe URL), S08–S13 | Strip it from route templates; never treat it as a new state | common | in scope |
| LO-25 | Postback navigation (every link is a form submit with hidden view state) | Legacy bank `menu.do` (bank S09) and `lista.do` (bank S10): `__doPostBack`, `__VIEWSTATE` | Recognise postback navigation as navigation, not a data change | common | in scope |
| LO-26 | Endless spaces (calendar "next month", pagination with no end) | Shop `/sklep?strona=n`, "Następna strona" always shown (shop S01); bank `/bank/wyciagi?miesiac=YYYY-MM`, "Poprzedni miesiąc" has no lower bound (bank S06) | Stop expanding after a pattern repeats; one template, not hundreds of states | common | in scope |
| LO-27 | Pop-up windows (`window.open`) | Insurer `/ubezpieczenia` "Ogólne warunki ubezpieczenia" (insurer S01) | Record the pop-up screen and return to the opener | common | in scope |
| LO-28 | File downloads (PDF statements, policy documents) | Bank `/bank/wyciagi` "Pobierz PDF" (bank S06); insurer `/ubezpieczenia#/polisy/:nr` "Pobierz polisę (PDF)" (insurer S04) | Record the download as an action and its file type; do not crawl into it | idea | in scope |
| LO-29 | Dead links, 404 and 500 pages in the legacy part | Legacy bank `/legacy/bank/archiwum.do` 404 (bank S12) and `/legacy/bank/raport.do` 500 (bank S13), linked from `menu.do` (bank S09) | Record them as defects (NFR evidence), keep going | common | in scope |

## Session, auth and state

| ID | Obstacle | Proving ground | Pathfinder should | Source | Status |
|---|---|---|---|---|---|
| LO-30 | Login page with CSRF token | `/logowanie?marka=<brand>` (shop S07, bank S02, insurer S02) | Log in with vault credentials (R-26); never show the password to the agent | idea | in scope |
| LO-31 | Account lockout after N failed logins | Login locks after 3 failures: shop S07, bank S02, insurer S02 | Stop after one failed login and report; never retry blindly | common | in scope |
| LO-32 | Session timeout mid-flow with a "Sesja wygasła" modal or redirect to login | Idle timeout on every logged-in screen: shop `/sklep/konto` (shop S06), bank S03–S07, insurer S03–S07 | Detect expiry, log in again, resume; do not record the login page as a step of the flow | idea | in scope |
| LO-33 | Server-held wizard state; Back breaks the flow | Insurer `/ubezpieczenia#/szkody/nowa` (insurer S06): "Nie używaj przycisku Wstecz przeglądarki." | Do not use browser Back inside wizards; record the warning as a rule | common | in scope |
| LO-34 | Cart shared between micro-frontends via storage or an event bus | Shell header badge `Koszyk (n)` and shop `/sklep/produkt/:slug`, `/sklep/koszyk`, `/sklep/zamowienie` (shop S02–S04) | See the cart change across micro-frontends as one state change | idea | in scope |
| LO-35 | Random A/B variant or feature flag per session | Shop `/sklep` hero banner variant A or B (shop S01) | Not record each variant as a new screen; note the variants | common | in scope |
| LO-36 | Second factor (SMS code) step | Bank transfer confirmation; code shown in a local test inbox | Hand off to a human, or use a test-only code source when configured | common | later |

## Bot checks and overlays

| ID | Obstacle | Proving ground | Pathfinder should | Source | Status |
|---|---|---|---|---|---|
| LO-37 | CAPTCHA-like widget (checkbox, then image challenge) | Shop `/sklep/zamowienie` before "Zamawiam i płacę" (shop S04); login after one failure: shop S07, bank S02, insurer S02 | Detect it, never solve it, hand it to a human | idea | in scope |
| LO-38 | Cookie consent banner as its own micro-frontend overlay | Shell cookie app on first visit, any shell page; ground truth lists it at shop S01, bank S01, insurer S01 | Dismiss through portal config obstacles; never record it as a state | common | in scope |
| LO-39 | Timed newsletter modal | Shop `/sklep` after 3 s (shop S01) | Dismiss; not a state | common | in scope |
| LO-40 | Chat widget in an iframe | Bank `/bank` bottom right (bank S01) | Ignore as an obstacle | common | in scope |
| LO-41 | Rate limiting (429) on fast requests | Backend middleware on all pages and API calls, no screen id: more than 30 requests per second per session | Back off and continue, or stop with a warning (as today) | common | in scope |

## Network and APIs

| ID | Obstacle | Proving ground | Pathfinder should | Source | Status |
|---|---|---|---|---|---|
| LO-42 | One GraphQL endpoint for many operations | Shop `POST /api/shop/graphql` (operations `Catalog`, `Product`, `Cart`, `AddToCart`, `UpdateCart`, `PlaceOrder`) on shop S01–S04 | Record API shapes per operation name, not one `/graphql` | common | in scope |
| LO-43 | Classic form POST + redirect (no XHR) | Insurer `/legacy/insurer/szkoda-stara.do` (insurer S08): POST then 302 to `?ok=1` | Record the POST shape (today only `xhr`/`fetch` are recorded, R-18) | F-R18 | in scope |
| LO-44 | Live updates over WebSocket or server-sent events | Bank `/bank/pulpit` exchange-rate ticker over SSE `/api/bank/ticker` (bank S03); the balance itself is not live | Page still counts as stable; ticker text is not a state change | common | in scope |
| LO-45 | Spinner or long polling that never settles | Insurer `/ubezpieczenia` "Porównaj oferty" then "Trwa wyliczanie składki…" (insurer S01) | Stop waiting after a bound; record as slow, not hang | common | in scope |
| LO-46 | Legacy XML/SOAP endpoint behind a form | Bank exchange rates | Record the call and its XML shape | common | later |

## Forms and business data

| ID | Obstacle | Proving ground | Pathfinder should | Source | Status |
|---|---|---|---|---|---|
| LO-47 | Client-side and server-side validation disagree | Insurer `/ubezpieczenia#/szkody/nowa` step 1 "Data zdarzenia" (insurer S06): client accepts any date, server rejects dates older than 30 days | Record both rules and the mismatch | common | in scope |
| LO-48 | Cascading fields loaded from an API (choose A, then B loads) | Shop `/sklep/zamowienie` "Miasto" then "Wybierz paczkomat" via `/api/shop/lockers?miasto=` (shop S04) | Fill in order; record the dependency | common | in scope |
| LO-49 | Polish formats with checksums: PESEL, NIP, IBAN, postal code `00-000`, decimal comma | Bank `/bank/przelew` IBAN checksum and decimal comma (bank S04); shop `/sklep/zamowienie` postal code `00-000` (shop S04); not yet: no insurer client-data form (PESEL, NIP) is built | Use valid test values; record the format rules | common | in scope |
| LO-50 | Portal clock differs from the real date | Estate date 2026-03-16 (`/api/clock`): shop `/sklep/konto` order dates (shop S06), bank `/bank/przelew/potwierdzenie` booking date (bank S05), insurer `…/dodatki` start-date rule (insurer S05) | Judge dates against the portal's date | F-12 (spec 004) | in scope |
| LO-51 | Rules that show only past a threshold (free delivery over 200 zł, age limits) | Shop `/sklep/koszyk` "Darmowa dostawa od 200,00 zł" (shop S03); insurer `…/dodatki` "Assistance Premium" from 50 000 zł (insurer S05) | Find the rule through the trace; BA records it with evidence | common | in scope |
