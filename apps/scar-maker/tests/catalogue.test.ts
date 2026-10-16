import { describe, expect, it } from 'vitest';
import { parseCatalogue, readCatalogue } from '../src/catalogue.js';
import { SCARS } from '../src/scars/index.js';

describe('scars.yaml', () => {
  it('lists exactly the scar modules, with the module entry as route', () => {
    const catalogue = readCatalogue();
    expect(catalogue.map((e) => e.id)).toEqual(SCARS.map((s) => s.id));
    for (const e of catalogue) expect(e.route).toBe(SCARS.find((s) => s.id === e.id)!.entry);
  });

  it('every entry route is served by its module', () => {
    for (const s of SCARS) expect(Object.keys(s.routes)).toContain(s.entry);
  });

  it('refuses a duplicate id and an unknown status', () => {
    const one =
      '- {id: SC-01, title: t, source: [C-1], route: /a, before: b, after: a, status: gap}\n';
    expect(() => parseCatalogue(one + one)).toThrow(/duplicate id SC-01/);
    expect(() => parseCatalogue(one.replace('gap', 'done'))).toThrow();
  });
});
