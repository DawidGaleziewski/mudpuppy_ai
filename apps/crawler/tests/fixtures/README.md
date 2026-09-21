# Test fixtures

Saved inputs for the pure packages, so `fingerprint` and `safety` can be unit-tested offline
(constitution Principle VII). Fixtures must contain no real personal data.

| Folder     | Holds                                                                                                               | Used by                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `aria/`    | Saved ARIA snapshots (listing pages with different items, search results, a form page, a page with an open overlay) | `fingerprint`, PII scrubber tests   |
| `har/`     | HAR files and block-page responses (403/429, CAPTCHA markers, normal 200/404)                                       | block detector, network shape tests |
| `actions/` | Labeled action descriptors with their expected safety class                                                         | `safety` classifier                 |
| `urls/`    | URL lists (tracking params, numeric/slug ids, query variants)                                                       | route-template inference            |
