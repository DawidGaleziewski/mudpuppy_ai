# R-62 open decision: transit zones (how the harness knows which hosts a login passes through)

Status: **open, the owner is thinking it over** (2026-10-15). Roadmap: R-62 [battle-tested-scar].
Source: `user_input/mudpuppy-ground-challenge.zip`, field issues GC-09 and GC-11, scan finding SQ-5,
decision D-2.

The other parts of D-2 are decided (see R-60 and R-62 in `roadmap.md`): one condition wait with a
quiet limit and a hard limit, a `pending` login result, and a separate rate budget for static files.
This page is only about the last question.

## 1. The problem in one picture

A login on a corporate SSO portal does not stay on one site. After you press "Log in", the browser
goes through several pages on different hosts before it lands on the portal:

```
portal.example.test/start          (portal: "please log in" → redirect)
   → sso.example.test/authorize    (identity provider: the login form)
   → [submit]
   → sso.example.test/mfa-check     (identity provider: an intermediate page, no input)
   → sso.example.test/redirecting   (identity provider: "please wait…", script redirect)
   → portal.example.test/callback?code=…   (portal: exchanges the code for a session)
   → portal.example.test/dashboard (portal: logged in)
```

Every page from "authorize" to "callback" is **in transit**: the login is not finished, and none of
these pages is a screen of the portal the BA should document. The hosts and paths the browser passes
through on the way are the **transit zone**.

## 2. What goes wrong today without it

1. **The success check runs too early.** Today the login checks once, after the page settles: "is
   the URL no longer the login page, and/or is the success text there?". In the field it ran while
   the browser was on `sso…/redirecting`, saw no success text, and reported `failed / unknown`,
   although a second later the user was on the dashboard.
2. **Login pages end up in the map.** Every page that settles can become a state, so the provider's
   pages ("please wait…", the MFA check) can appear as screens in the documentation, mixed with the
   portal's own screens.
3. **A focused run cannot log in.** When a run is narrowed with `urls.allowed` (say only
   `/claims/*`), the redirect to `sso.example.test` is outside the allowed URLs and is blocked, so
   the login never happens. In the field this looked like "scan from a point starts over" (SQ-5).

## 3. What a transit zone changes

While the browser is inside the zone:

| | Without a zone (today) | With a zone |
| --- | --- | --- |
| Success check | runs once, possibly mid-chain | waits until the browser leaves the zone, then checks; still inside when time runs out → `pending` |
| Provider pages | may become states in the map | recorded only as redirect hops of the visit (R-38 already records hops) |
| `urls.allowed` of a focused run | blocks the provider's host | the zone is always allowed during login |
| Evidence | none about the chain | the chain is kept on the run, so a stalled login shows where it stalled |

The zone is **only about login**. Outside a login the provider's host is treated like any other
host (for example, a "change password" link that leads to the provider follows the normal rules).

## 4. The three options

### (a) Declared: the user writes the zone into the portal file

```yaml
login:
  transit:
    - sso.example.test          # a whole host
    - portal.example.test/callback   # a path on the portal itself
```

- **Good:** exact and predictable; easy to review; the same every run; a scar-maker test can check it.
- **Bad:** you must know the hosts before the first run. Corporate SSO often has more hops than you
  see in a browser (a second host for MFA, a load-balancer host, a callback path). Forgetting one
  makes the login fail in exactly the way it does today, and the first day at a new client is when
  you know least.
- **Typical failure:** "login works on my machine through the proxy, fails on the dev tier": the
  dev tier uses another provider host nobody wrote down.

### (b) Learned: the harness works it out on every login

Rule: every host (and the portal's own paths) the browser passes through **between pressing
submit and seeing the success signal** is transit, for this login.

- **Good:** zero setup; works on the first day; adapts if the provider changes hosts.
- **Bad:** fuzzier.
  - A portal that, after login, redirects to an unrelated host (a terms-of-use page on another
    domain, a "news" landing on a CMS host) would have that host treated as transit and never
    mapped there during login, and the success check would wait for it to end.
  - If the success signal is never seen (wrong success text in the config), *everything* the browser
    visits counts as transit, so the run learns nothing useful and the result is a long `pending`.
  - Two logins may learn slightly different zones, so runs are less comparable.

### (c) Both: declared hosts are fixed, learned hosts are proposed

- Declared hosts (a) are always transit.
- During a login the harness also learns new hosts as in (b), **uses them for that login only**,
  records them on the run ("learned transit: sso2.example.test") and **proposes** them for the portal
  file: shown in the dashboard (Settings / the portal) and offered by the chat. You accept once and
  they become declared; you reject and they are not used again.
- **Good:** works on day one with no setup, and becomes exact once you confirm; nothing is changed in
  your config without you.
- **Bad:** the most to build (learning + a proposal flow in dashboard and chat); for the first login
  the fuzziness of (b) still applies.

## 5. Questions that may help you decide

1. **How often do you know the provider hosts up front?** If almost always (you get them from the
   client's IT with the test users), (a) is enough. If rarely, (b) or (c).
2. **Do you want config to change only by your hand?** If yes, (a) or (c); (b) changes behaviour
   silently from run to run.
3. **Is first-day success more important than predictability?** First day → (b) or (c);
   predictability → (a).
4. **How much do you want to build now?** (a) is small, (b) medium, (c) the largest; (a) can grow
   into (c) later without breaking anything (the learned part is an addition).

## 6. Claude's recommendation

**(c), but built in two steps:** first (a), declared zones, which is small and fixes the field bug as
soon as the hosts are written down; the run already records the full redirect chain, so the hosts
to declare can be read off a failed login. Then the learning and proposal part as a follow-up, once
the scar-maker SSO scar (multi-hop login across `idp.scar.test` and `portal.scar.test`) is a gate.
This way nothing waits on the bigger design, and the end state is still (c).

## 7. Not affected by this choice

Whatever you pick, these are already decided and do not depend on it:

- the condition wait with a quiet limit and a hard limit (Q1, built in R-60, reused in R-62);
- `pending` with one silent re-check, then returned to the agent, who may wait or log in again
  (Q2; account lockout is not a concern);
- the separate budget for static files (Q4);
- the input/change/blur events on login fields (C-6).
