/**
 * Whom to scan (spec 024 US4, spec 046 FR-009): `pnpm personas:sample <portal>` reads the portal's
 * personas (`personas/<portal>/*.yaml`) and proposes one per distinct attribute combination, plus
 * the pairs among them that differ in exactly one attribute. Prints the persona ids to scan; it
 * changes nothing. Personas whose file does not load are named and left out.
 */
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadPersona, samplePersonas, type SamplePersona } from '@mudpuppy/config';

const portal = process.argv[2];
if (!portal || !/^[a-z0-9][a-z0-9_-]*$/.test(portal)) {
  console.error('usage: pnpm personas:sample <portal>');
  process.exit(2);
}
const dir = join(resolve(import.meta.dirname, '../../..'), 'personas', portal);
let files: string[];
try {
  files = readdirSync(dir).filter((f) => f.endsWith('.yaml'));
} catch {
  console.error(`no personas folder for ${portal}: ${dir}`);
  process.exit(2);
}
const personas: SamplePersona[] = [];
for (const f of files) {
  try {
    const p = loadPersona(join(dir, f));
    personas.push({ id: p.id, attributes: p.attributes });
  } catch (e) {
    console.error(`left out ${f}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  }
}
const s = samplePersonas(personas);
console.log(
  `${portal}: ${String(s.chosen.length)} of ${String(personas.length)} persona(s) to scan`,
);
for (const c of s.chosen) {
  const attrs = Object.entries(c.combination)
    .map(([k, v]) => `${k}=${v || '–'}`)
    .join(', ');
  const also = c.stands_for.length ? ` (also stands for ${c.stands_for.join(', ')})` : '';
  console.log(`  ${c.id}: ${attrs || 'no attributes'}${also}`);
}
if (s.pairs.length > 0) {
  console.log('pairs that differ in one attribute:');
  for (const p of s.pairs) console.log(`  ${p.a} / ${p.b}: ${p.attribute}`);
}
