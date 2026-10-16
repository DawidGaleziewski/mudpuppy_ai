// `scars.yaml`: the catalogue of scars (spec 030 FR-002), parsed and validated.

import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

export const CATALOGUE_FILE = new URL('../scars.yaml', import.meta.url);

export const ScarEntry = z
  .object({
    id: z.string().regex(/^SC-\d{2,}$/),
    title: z.string().min(1),
    /** Field ids from the ground-challenge pack (`C-2`, `GC-14`, …). */
    source: z.array(z.string().min(1)).min(1),
    route: z.string().startsWith('/'),
    before: z.string().min(1),
    after: z.string().min(1),
    /** `gap` while the harness still fails it, `gate` once fixed (G-17). */
    status: z.enum(['gap', 'gate']),
  })
  .strict();
export type ScarEntry = z.infer<typeof ScarEntry>;

/** The catalogue; duplicate ids throw. */
export function parseCatalogue(text: string): ScarEntry[] {
  const entries = z.array(ScarEntry).parse(parse(text) ?? []);
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.id)) throw new Error(`scars.yaml: duplicate id ${e.id}`);
    seen.add(e.id);
  }
  return entries;
}

export const readCatalogue = (): ScarEntry[] =>
  parseCatalogue(readFileSync(CATALOGUE_FILE, 'utf8'));
