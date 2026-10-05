# Contract: credential vault and `pnpm vault`

Run from `apps/crawler`. `--env` defaults to `PATHFINDER_ENV` (or `sandbox`) and selects
`data/db/<env>.sqlite`.

| Command | Effect | Prints |
|---|---|---|
| `pnpm vault set <portal> <REF> [--env e] [--stdin]` | Reads the value from a hidden TTY prompt (or stdin), encrypts it, upserts it | `stored <REF> for <portal> on <env>` |
| `pnpm vault list [<portal>] [--env e]` | — | table: portal, env, ref, key id, created, updated (never values) |
| `pnpm vault delete <portal> <REF> [--env e]` | Deletes the row | `deleted …` / exit 1 if absent |
| `pnpm vault generate <portal> --login <REF>=<name> --password <REF> [--env e] [--seed <file> --seed-user <id>]` | Stores the login name and a generated 24-character password; with `--seed`, upserts `{ id, login, hash }` into the seed file (Django `pbkdf2_sha256`) | `generated <REF> …` (never the password) |
| `pnpm vault check <portal> <persona> [--env e]` | Resolves every persona `ref:` | `ok` or the missing refs, exit 1 |
| `pnpm vault reveal <portal> <REF> [--env e] --yes-print-secret` | Prints the value (for logging in by hand) | the value |

Errors are exit code 1 with one line:

- `vault key not found at <path>; set PATHFINDER_VAULT_KEY_FILE or run "pnpm vault set" to create it`
- `<REF> for <portal> on <env> was stored with key <id>, current key is <id>; re-enter it`
- `decryption failed for <REF> (tampered or wrong portal/env)`

## Library (`@pathfinder/vault`)

```ts
loadKey(opts?: { path?: string; create?: boolean }): VaultKey   // { id, bytes }
encrypt(key, aad: { portal_id; environment; ref }, plaintext: string): Sealed  // { nonce, ciphertext, key_id }
decrypt(key, aad, sealed): string                               // throws VaultError
createVaultStore(db): { set, get, list, delete }               // over table `credentials`
resolvePersonaRefs(store, key, portalId, env, auth): { values: Record<field,string>; missing: string[] }
createRedactor(): { add(v: string): void; redact(s: string): string; redactJson(x): unknown; size: number }
djangoPbkdf2(password, { iterations = 600000, salt? }): string
generatePassword(length = 24): string
```

`redact` replaces every registered value (at least 4 characters long; the longest first) with
`[secret]`. It also replaces the value's URL-encoded and JSON-escaped forms.
