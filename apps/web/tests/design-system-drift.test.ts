import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain ES module script without types
import { FILES, SOURCE, TARGET } from '../scripts/sync-design-system.mjs';

describe('the design system copy (R-96)', () => {
  it('matches the design package byte for byte: run `pnpm ds:sync` after a designer change', () => {
    for (const f of FILES as string[]) {
      const source = readFileSync(join(SOURCE as string, f));
      const copy = readFileSync(join(TARGET as string, f));
      expect(copy.equals(source), `${f} differs from the design package`).toBe(true);
    }
  });
});
