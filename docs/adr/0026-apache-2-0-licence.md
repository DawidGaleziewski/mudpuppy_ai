# ADR-0026: Apache-2.0 licence

- **Status:** Accepted
- **Date:** 2026-10-25
- **Supersedes:** [ADR-0017](0017-proprietary-licence.md)

## Context

The repository was under a proprietary licence (ADR-0017). It was prepared for publication as
open source on branch `chore/open-source-apache`.

## Decision

- `LICENSE` is the Apache License, Version 2.0, replacing the proprietary notice. `NOTICE` names
  the product and the copyright holder; `README.md` states the licence.
- Third-party files keep their own licences, listed in `THIRD_PARTY_NOTICES.md` (Mermaid MIT,
  the console fonts under the SIL Open Font License or Apache 2.0, GitHub Spec Kit MIT);
  dependencies installed by pnpm and uv keep the licences of their packages.
- In the same change: the live-site portal configs and personas, old console screenshots and
  baselines, and the raw designer zip drops (duplicates of `docs/design/salvage-yard`) were
  removed; config tests no longer depend on the removed files; `docs/getting-started.md` walks a
  new user from a fresh clone to exported documentation on the bundled reference portal.

## Consequences

- Good: anyone may use, modify and redistribute the code under the Apache-2.0 terms.
- Good: a newcomer starts from local, disposable portals (reference portal, proving ground)
  instead of someone else's live site.
- Bad: the portal and persona configs of the live sites used during development are no longer in
  the repository; a new portal starts from its own `portals/<portal>/portal.yaml` and personas
  (`docs/portal-config.md`).

## Alternatives considered

- Keep the proprietary licence (ADR-0017). No other licences are discussed in the sources.

## Sources

- git commit `ee6dc76c` (2026-10-25: "Open source under Apache-2.0; getting-started guide; drop
  corporate portal configs and old screenshots")
- `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, `README.md` (License)
- `docs/getting-started.md`
