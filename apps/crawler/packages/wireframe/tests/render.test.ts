import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { elementKeys, parseAriaYaml, type AriaNode } from '@mudpuppy/core';
import { describe, expect, it } from 'vitest';
import { MAX_NODES, layoutWireframe, renderWireframe } from '../src/index.js';

/**
 * spec 008 US3 (FR-014–FR-017, contracts/wireframe-format.md). Goldens live in tests/golden/;
 * regenerate with `UPDATE_GOLDEN=1 pnpm vitest run --project wireframe` and review the diff by
 * hand, then bump GENERATOR_VERSION.
 */

const GOLDEN = fileURLToPath(new URL('./golden', import.meta.url));
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const fixture = (name: string): string =>
  readFileSync(
    new URL(`../../core/tests/fixtures/element-keys/${name}.yaml`, import.meta.url),
    'utf8',
  );

const LONG_LIST = [
  '- main:',
  '  - heading "Oferty" [level=1]',
  '  - list:',
  ...Array.from({ length: 12 }, (_, i) => [
    '    - listitem:',
    `      - link "Oferta ${i + 1}":`,
    `        - /url: /oferta/${i + 1}`,
  ]).flat(),
  '  - table:',
  '    - rowgroup:',
  ...Array.from({ length: 6 }, (_, r) => [
    `      - row "r${r}":`,
    ...Array.from({ length: 5 }, (_, c) =>
      r === 0 ? `        - columnheader "K${c}"` : `        - cell "${r}.${c}"`,
    ),
  ]).flat(),
  '  - img "Logo ubezpieczyciela"',
  '  - paragraph: ' + 'Długi akapit tekstu. '.repeat(15),
].join('\n');

const CASES: Record<string, { yaml: string; title: string }> = {
  basic: { yaml: fixture('basic'), title: 'Kalkulator OC/AC' },
  nested: { yaml: fixture('nested'), title: 'Sekcje' },
  duplicates: { yaml: fixture('duplicates'), title: 'Oferty' },
  'long-list': { yaml: LONG_LIST, title: 'Lista ofert' },
};

describe('renderWireframe goldens', () => {
  mkdirSync(GOLDEN, { recursive: true });
  for (const [name, c] of Object.entries(CASES)) {
    it(`${name}: matches the SVG and Excalidraw goldens, byte for byte`, () => {
      const out = renderWireframe(c.yaml, { title: c.title });
      for (const [ext, text] of [
        ['svg', out.svg],
        ['excalidraw', out.excalidraw],
      ] as const) {
        const file = `${GOLDEN}/${name}.${ext}`;
        if (UPDATE || !existsSync(file)) writeFileSync(file, text);
        expect(text).toBe(readFileSync(file, 'utf8'));
      }
    });
  }
});

describe('renderWireframe', () => {
  it('is deterministic: a second render is identical', () => {
    for (const c of Object.values(CASES))
      expect(renderWireframe(c.yaml, { title: c.title })).toEqual(
        renderWireframe(c.yaml, { title: c.title }),
      );
  });

  it('draws every keyed element it shows under its element key (FR-017)', () => {
    const yaml = fixture('basic');
    const { svg } = renderWireframe(yaml);
    const drawn = new Set([...svg.matchAll(/data-key="([^"]+)"/g)].map((m) => m[1]));
    const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const keys = elementKeys(parseAriaYaml(yaml))
      .map((e) => e.key)
      .filter((k) => !k.startsWith('option')); // options are part of their combobox
    for (const k of keys) expect([...drawn].map((d) => unescape(d!))).toContain(k);
  });

  it('writes a valid Excalidraw scene with the element key on every element', () => {
    const scene = JSON.parse(renderWireframe(fixture('basic')).excalidraw);
    expect(scene).toMatchObject({ type: 'excalidraw', version: 2, files: {} });
    expect(scene.elements.length).toBeGreaterThan(10);
    const ids = new Set<string>();
    for (const e of scene.elements) {
      expect(['rectangle', 'ellipse', 'line', 'text']).toContain(e.type);
      for (const f of ['id', 'x', 'y', 'width', 'height', 'seed', 'version', 'versionNonce'])
        expect(e).toHaveProperty(f);
      expect(Number.isInteger(e.seed)).toBe(true);
      expect(e.customData.key).toEqual(expect.any(String));
      if (e.type === 'text') expect(e.text).toBe(e.originalText);
      if (e.type === 'line') expect(e.points).toHaveLength(2);
      ids.add(e.id);
    }
    expect(ids.size).toBe(scene.elements.length); // ids are unique
  });

  it('invents nothing: every text it draws comes from the snapshot or the title', () => {
    const yaml = fixture('nested');
    const seen = new Set<string>(['Sekcje']);
    const collect = (nodes: AriaNode[]): void => {
      for (const n of nodes) {
        seen.add(n.role);
        if (n.name) seen.add(n.name.replace(/\s+/g, ' ').trim());
        if (n.text) seen.add(n.text);
        collect(n.children);
      }
    };
    collect(parseAriaYaml(yaml));
    const model = layoutWireframe(yaml, { title: 'Sekcje' });
    for (const p of model.prims)
      if (p.kind === 'text' && p.text !== '▾' && !/^\+\d+ more/.test(p.text))
        for (const part of p.text.split(' · ')) expect(seen).toContain(part);
  });

  it(`stops after ${MAX_NODES} elements and says how many it left out`, () => {
    const yaml = Array.from({ length: 150 }, (_, i) => `- button "B${i}"`).join('\n');
    const { svg } = renderWireframe(yaml);
    expect(svg).toContain('+30 more elements');
    expect(svg).not.toContain('B149');
  });

  it('strips icon-font glyphs and caps labels at 60 characters', () => {
    const { svg } = renderWireframe(
      `- link " Zaloguj się"\n- heading "${'x'.repeat(80)}" [level=2]`,
    );
    expect(svg).toContain('>Zaloguj się<');
    expect(svg).toContain(`${'x'.repeat(59)}…`);
  });
});
