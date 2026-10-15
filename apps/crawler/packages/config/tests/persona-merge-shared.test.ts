import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPersona } from '../src/index.js';

/**
 * Spec 024 F-06: the dashboard's Settings resolves personas through `extends` in Python
 * (`queries_settings.py`); both sides are checked against this one tree and its expected result.
 */
const ROOT = fileURLToPath(new URL('../../../tests/fixtures/personas/extends', import.meta.url));

interface Expected {
  portal: string;
  personas: Record<string, { attributes: unknown; logged_in: boolean; refs: string[] }>;
}
const expected = JSON.parse(readFileSync(join(ROOT, 'expected.json'), 'utf8')) as Expected;

const refsOf = (auth: unknown): string[] =>
  auth && typeof auth === 'object'
    ? Object.values(auth as Record<string, string>)
        .filter((v) => v.startsWith('ref:'))
        .map((v) => v.slice(4))
        .sort()
    : [];

describe('persona merge, shared fixture (spec 024 F-06)', () => {
  for (const [id, want] of Object.entries(expected.personas))
    it(`resolves ${id} as expected.json says`, () => {
      const p = loadPersona(join(ROOT, expected.portal, `${id}.yaml`), {
        fence: [join(ROOT, '_mixins'), join(ROOT, expected.portal)],
      });
      expect({
        attributes: p.attributes,
        logged_in: p.auth !== 'none',
        refs: refsOf(p.auth),
      }).toEqual(want);
    });
});
