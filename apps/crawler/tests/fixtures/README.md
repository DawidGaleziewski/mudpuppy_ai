# Test fixtures

Saved inputs for the pure packages, so `fingerprint` and `safety` can be unit-tested offline
(constitution Principle VII). Fixtures must contain no real personal data.

| Folder     | Holds                                                                                                                   | Used by                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `aria/`    | Saved ARIA snapshots (listing pages with different items, search results, a form page, a page with an open overlay)     | `fingerprint`, PII scrubber tests   |
| `har/`     | HAR files and block-page responses (403/429, CAPTCHA markers, normal 200/404)                                           | block detector, network shape tests |
| `actions/` | Labeled action descriptors with their expected safety class                                                             | `safety` classifier                 |
| `urls/`    | URL lists (tracking params, numeric/slug ids, query variants); `liveinsurer-robots-sample.json` with expected robots verdicts | route-template inference, robots    |
| `robots/`  | Real `robots.txt` files, byte-exact, and the RFC 9309 examples                                                          | `safety` robots parser              |

## `robots/`

Fetched 2026-09-24 with `curl -L -A "PathfinderAI-Crawler/0.1 (fixture capture)"`. Replace a file only
together with the tests that assert on it.

| File                     | Source                                                 | Note                                                                   |
| ------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `liveinsurer.example.txt`           | `https://www.liveinsurer.example/robots.txt`                      | query rules (`*cHash*`, `/*?id=*`), `Allow` exceptions, `Sitemap`      |
| `marketsite.example.txt` | `https://marketsite.example/robots.txt`                | a `*` group and a `Googlebot` group                                    |
| `forum.example.txt`           | `https://forum.example/robots.txt` (redirected from `www.`) | disallows `/api/`, which its pages call                                |
| `pl.wikipedia.org.txt`   | `https://pl.wikipedia.org/robots.txt`                  | large, many named groups, comments                                     |
| `classifieds.example.403.html`        | `https://www.classifieds.example/robots.txt`                        | the CDN answered **403** with an HTML error page: a 4xx means no rules |
| `rfc9309-examples.txt`   | RFC 9309 §2.2.2 and §5.1-§5.2 examples                 | the §5.2 longest-match group is named `longbot` here                   |
