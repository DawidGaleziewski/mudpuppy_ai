import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elementKeys, parseAriaYaml, type AriaJsonNode } from '../src/element-key.js';
import { Layout, buildLayout } from '../src/layout.js';
import { maskText } from '../src/pii.js';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/element-keys/${name}`, import.meta.url), 'utf8');
const tree = (name: string) => JSON.parse(fixture(`${name}.json`)) as AriaJsonNode[];

const base = {
  scrollX: 0,
  scrollY: 0,
  viewport: { width: 1280, height: 720 },
  page: { width: 1280, height: 2400 },
  cut: false,
};

describe('buildLayout (spec 008 data-model.md "Layout")', () => {
  for (const name of ['basic', 'duplicates', 'nested']) {
    it(`${name}: keys match the YAML snapshot and the result is a valid Layout`, () => {
      const layout = buildLayout({ ...base, tree: tree(name) });
      expect(Layout.parse(layout)).toEqual(layout);
      expect(layout.elements.map((e) => e.key)).toEqual(
        elementKeys(parseAriaYaml(fixture(`${name}.yaml`))).map((e) => e.key),
      );
    });
  }

  it('converts viewport boxes to page coordinates with the scroll offset', () => {
    const t: AriaJsonNode[] = [
      { role: 'button', name: 'Go', box: { x: 10.4, y: -50.6, width: 80, height: 30 } },
    ];
    const layout = buildLayout({ ...base, scrollX: 5, scrollY: 300, tree: t });
    expect(layout.elements).toEqual([
      {
        key: 'button "Go"',
        role: 'button',
        name: 'Go',
        box: { x: 15, y: 249, width: 80, height: 30 },
      },
    ]);
  });

  it('nulls boxes with no area, outside the page or below the cut, and clips partial ones', () => {
    const t: AriaJsonNode[] = [
      { role: 'button', name: 'zero', box: { x: 0, y: 0, width: 0, height: 10 } },
      { role: 'button', name: 'below', box: { x: 0, y: 1200, width: 50, height: 20 } },
      { role: 'button', name: 'missing' },
      { role: 'button', name: 'straddles', box: { x: 0, y: 990, width: 50, height: 20 } },
    ];
    const layout = buildLayout({
      ...base,
      page: { width: 1280, height: 1000 },
      cut: true,
      tree: t,
    });
    expect(layout.cut).toBe(true);
    expect(layout.elements.map((e) => e.box)).toEqual([
      null,
      null,
      null,
      { x: 0, y: 990, width: 50, height: 10 },
    ]);
  });

  it('masks names before keying when a mask is given, so keys match a masked snapshot', () => {
    const t: AriaJsonNode[] = [{ role: 'link', name: 'Napisz: jan@example.com' }];
    const layout = buildLayout({ ...base, tree: t, mask: maskText });
    // Playwright quotes the whole item when the name holds ": ".
    const yamlKeys = elementKeys(parseAriaYaml(maskText(`- 'link "Napisz: jan@example.com"'\n`)));
    expect(layout.elements[0]!.key).toBe(yamlKeys[0]!.key);
    expect(layout.elements[0]!.name).not.toContain('jan@example.com');
  });
});
