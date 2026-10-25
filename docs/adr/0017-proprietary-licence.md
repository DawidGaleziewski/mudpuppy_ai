# ADR-0017: A proprietary licence

- **Status:** Superseded by [ADR-0026](0026-apache-2-0-licence.md)
- **Date:** 2026-10-12

## Context

The owner asked for a licence for the repository (2026-10-12).

## Decision

- `LICENSE`: all rights reserved, confidential, no AI training or text and data mining.
- `THIRD_PARTY_NOTICES.md` listing the third-party files and their licences (Mermaid and Spec Kit
  MIT texts, htmx, JetBrains Mono).

## Consequences

- The code could not be reused outside the owner's permission.
- Replaced on 2026-10-25 by Apache-2.0 when the repository was prepared for publication
  (ADR-0026).

## Alternatives considered

None recorded in the sources.

## Sources

- `CHANGELOG.md` ("Proprietary licence (2026-10-12, asked by the owner)")
- git commit `ee6dc76c` ("LICENSE: Apache License 2.0 (replaces the proprietary notice)")
