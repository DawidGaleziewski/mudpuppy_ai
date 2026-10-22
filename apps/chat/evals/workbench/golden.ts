/**
 * The Workbench golden prompts (spec 043 T020, D-8): `golden.yaml` checked against the contract,
 * so a task never expects a component the catalogue does not have or the path cannot hold.
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import { loadContract } from '@mudpuppy/workbench-contract';

const catalogue = loadContract().catalogue.components;
const TYPES = catalogue.map((c) => c.type) as [string, ...string[]];

export const GoldenTask = z
  .object({
    id: z.string().regex(/^(chat|map|inj)-\d{2}$/),
    prompt: z.string().min(3),
    page_text: z.string().optional(),
    path: z.enum(['chat', 'mapping']),
    components: z.array(z.enum(TYPES)),
    allowed: z.array(z.enum(TYPES)),
    command: z.enum(['scan.start', 'scan.resume', 'scan.stop']).nullable(),
    injected: z.boolean().optional(),
  })
  .strict()
  .superRefine((t, ctx) => {
    for (const type of [...t.components, ...t.allowed]) {
      const entry = catalogue.find((c) => c.type === type);
      if (entry !== undefined && (entry.phase > 1 || !entry.paths.includes(t.path)))
        ctx.addIssue({
          code: 'custom',
          message: `${t.id}: ${type} is not on ${t.path} in phase 1`,
        });
    }
  });
export type GoldenTask = z.infer<typeof GoldenTask>;

export const GOLDEN_FILE = new URL('golden.yaml', import.meta.url);

export function loadGolden(file: URL = GOLDEN_FILE): GoldenTask[] {
  const doc = parse(readFileSync(file, 'utf8')) as { tasks: unknown[] };
  return z.array(GoldenTask).parse(doc.tasks);
}
