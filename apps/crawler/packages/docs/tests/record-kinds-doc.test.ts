import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DOC_CONTENT_BY_KIND, DocKind } from '@mudpuppy/docs-model';

/**
 * The BA reads `ba-practice/references/record-kinds.md`; a stale field name there makes the BA write
 * records the server refuses (spec 015 F-20, spec 019 T020). Every required field must be named, and
 * every name the table mentions must exist in the kind's schema (as a field or an allowed value).
 */
const DOC = readFileSync(
  new URL('../../../../../.claude/skills/ba-practice/references/record-kinds.md', import.meta.url),
  'utf8',
);

/** The "Required content" cell of a kind's row. */
function cellOf(kind: DocKind): string {
  const row = DOC.split('\n').find((l) => l.startsWith(`| \`${kind}\``));
  if (!row) throw new Error(`no row for ${kind}`);
  return row.split('|')[2]!;
}

/** Every property name and enum value anywhere in the kind's JSON schema. */
function namesIn(schema: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) for (const s of schema) namesIn(s, out);
  else if (schema && typeof schema === 'object') {
    const o = schema as Record<string, unknown>;
    if (o.properties) for (const k of Object.keys(o.properties)) out.add(k);
    if (Array.isArray(o.enum)) for (const v of o.enum) out.add(String(v));
    for (const v of Object.values(o)) namesIn(v, out);
  }
  return out;
}

describe('record-kinds.md agrees with the record schemas (spec 019 T020)', () => {
  for (const kind of DocKind.options) {
    it(`${kind}: required fields named, no unknown names`, () => {
      const cell = cellOf(kind);
      const shape = DOC_CONTENT_BY_KIND[kind].shape as Record<string, { isOptional(): boolean }>;
      for (const [name, s] of Object.entries(shape))
        if (!['kind', 'title', 'summary'].includes(name) && !s.isOptional())
          expect(cell, `${kind}.${name}`).toContain(`\`${name}`);
      const known = namesIn(z.toJSONSchema(DOC_CONTENT_BY_KIND[kind], { io: 'input' }));
      const mentioned = [...cell.matchAll(/`([a-z_]+)(?:\[\])?\??`/g)].map((m) => m[1]!);
      // the cell also quotes examples (`/kalkulator/pojazd`, `"200"`), which the pattern skips
      for (const name of mentioned) expect(known, `${kind} mentions ${name}`).toContain(name);
    });
  }
});
