# ADR-0013: Credentials only as `ref:NAME`, values in an encrypted vault

- **Status:** Accepted
- **Date:** 2026-10-05 (spec 009, R-26); `ref:` references since 2026-09-20 (constitution 1.1.0)

## Context

Personas are YAML files in the repo. Logged-in crawling (R-26) needs real test-user passwords,
which must never reach the repo, the agent's context or the recorded evidence.

## Decision

- Personas reference secrets by name only (`ref:NAME`). The config loader rejects an `auth` field
  that looks like a literal credential.
- Values live in the store, encrypted per portal and environment: AES-256-GCM with a random nonce
  per value and `portal_id|environment|ref_name` as associated data, so a ciphertext copied to
  another row fails. The 32-byte key is a file outside the repository (mode 0600), created on
  first use; a `key_id` per row names a rotated key. Values come from a hidden prompt or stdin,
  never from argv. CLI: `pnpm vault` (`list` shows names only).
- The crawler's `login` tool types the values server-side; the agent never sees them. A run-scoped
  redactor replaces every resolved value with `[secret]` before any write (snapshot, network
  record, decision log, Playwright trace chunks, logs). After a session expiry it logs in once
  more; a rejected login is never retried (`LOGIN_BLOCKED`).
- In the console a credential is entered in a vault field that posts to the chat service; the
  value never reaches the assistant.

## Consequences

- Good: secrets stay out of git, out of model context and out of text evidence.
- Bad: screenshots are not redacted; a portal that echoes the password shows it in pixels (gate
  LO-30 checks the proving ground does not).
- Bad: a rotated or lost key means re-entering the values.

## Alternatives considered

- OS keyring: `libsecret` is missing on WSL, and it cannot be per environment and portal in SQL.
- SQLCipher: encrypts the whole DB and needs a native rebuild.
- `age` / `sops`: external tools.

## Sources

- `specs/009-legacy-proving-ground/research.md` §5, §6
- `specs/001-crawler-map-mode/contracts/config-schema.md` (Zod-level rules)
- `.specify/memory/constitution.md` Technical Constraints ▸ Portals and personas
- `specs/010-acp-chat-orchestrator/research.md` R5
- `CHANGELOG.md` R-25/R-26/R-27 entry; R-43 + R-44 entry (vault field)
