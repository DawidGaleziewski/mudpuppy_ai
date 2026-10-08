# Contract: layers and the boundary test

`apps/crawler/layers.json` (final package lists fixed by the layering task, research R6):

```json
{
  "layers": [
    { "name": "kernel", "packages": ["core", "fingerprint", "obstacles"] },
    { "name": "models", "packages": ["config", "safety", "docs-model", "chat-model", "trace"] },
    { "name": "store", "packages": ["store"] },
    { "name": "features", "packages": ["crawler", "docs", "vault", "wireframe", "workflow"] },
    { "name": "servers", "packages": ["mcp-server", "chat", "gates", "reference-portal"] }
  ],
  "exceptions": [
    { "from": "<pkg>", "to": "<pkg>", "reason": "<why>", "kind": "dev" }
  ]
}
```

Rules checked by `apps/crawler/tests/layers.test.ts` over every workspace `package.json`
(`dependencies` and `devDependencies` on `@pathfinder/*`):

1. A package may depend only on packages in its own or a lower layer.
2. A kernel package depends on no workspace package.
3. Every workspace package appears in exactly one layer.
4. `devDependencies` upward (e.g. a test fixture portal) are allowed only when listed in
   `exceptions` with a reason.

Failure message, one line per violation:

```text
layer rule: <pkg> (<layer>) may not depend on <dep> (<layer>) — move the shared part down or add an exception with a reason
```

In-package rules use ESLint `no-restricted-imports` with a message that names the guideline id,
e.g. MCP tool files may import `runtime/index` but not `runtime/pipeline/*` internals.
