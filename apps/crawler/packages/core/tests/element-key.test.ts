import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAX_KEYED_ELEMENTS,
  elementKeys,
  fromAriaJson,
  parseAriaYaml,
  parseNodeHeader,
  type AriaJsonNode,
} from '../src/element-key.js';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/element-keys/${name}`, import.meta.url), 'utf8');
const expectedKeys = (name: string): string[] => fixture(`${name}.keys.txt`).trim().split('\n');

describe('element keys (contracts/element-key.md)', () => {
  for (const name of ['basic', 'duplicates', 'nested']) {
    it(`${name}: YAML snapshot gives the golden keys`, () => {
      const keys = elementKeys(parseAriaYaml(fixture(`${name}.yaml`))).map((e) => e.key);
      expect(keys).toEqual(expectedKeys(name));
    });

    it(`${name}: the ariaSnapshotJSON tree of the same page gives the same keys`, () => {
      const tree = JSON.parse(fixture(`${name}.json`)) as AriaJsonNode[];
      expect(elementKeys(fromAriaJson(tree)).map((e) => e.key)).toEqual(expectedKeys(name));
    });
  }

  it('numbers repeats after the closing quote and keys unnamed nodes by role', () => {
    const keys = elementKeys(
      parseAriaYaml('- link "A"\n- link "A"\n- link\n- link ""\n- button "A"\n'),
    ).map((e) => e.key);
    expect(keys).toEqual(['link "A"', 'link "A"#2', 'link', 'link#2', 'button "A"']);
  });

  it('collapses whitespace and cuts names at 80 characters', () => {
    const long = 'x'.repeat(100);
    const [a, b] = elementKeys(parseAriaYaml(`- heading "  a \\n  b  "\n- heading "${long}"\n`));
    expect(a!.key).toBe('heading "a b"');
    expect(b!.name).toHaveLength(80);
  });

  it('skips text, properties and non-keyed roles but walks their children', () => {
    const tree = parseAriaYaml(
      '- generic:\n  - text: hello\n  - listitem:\n    - link "In":\n      - /url: /x\n- paragraph: Hi\n',
    );
    expect(elementKeys(tree).map((e) => e.key)).toEqual(['link "In"']);
    expect(tree[1]).toMatchObject({ role: 'paragraph', text: 'Hi' });
  });

  it(`stops keying after ${MAX_KEYED_ELEMENTS} elements`, () => {
    const yaml = Array.from({ length: 450 }, (_, i) => `- button "b${i}"`).join('\n');
    const keys = elementKeys(parseAriaYaml(yaml));
    expect(keys).toHaveLength(MAX_KEYED_ELEMENTS);
    expect(keys.at(-1)!.key).toBe('button "b399"');
  });

  it('returns [] for an empty or invalid snapshot', () => {
    expect(parseAriaYaml('')).toEqual([]);
    expect(parseAriaYaml(': : :\n  - [')).toEqual([]);
  });
});

describe('parseNodeHeader', () => {
  it('reads role, quoted name with escapes, regex names and attributes', () => {
    expect(parseNodeHeader('heading "A \\"q\\"" [level=2]')).toEqual({
      role: 'heading',
      name: 'A "q"',
      attrs: { level: '2' },
    });
    expect(parseNodeHeader('checkbox "Zgoda" [checked] [disabled]')).toEqual({
      role: 'checkbox',
      name: 'Zgoda',
      attrs: { checked: true, disabled: true },
    });
    expect(parseNodeHeader('link /Więcej \\d+/')).toEqual({
      role: 'link',
      name: '/Więcej \\d+/',
      attrs: {},
    });
    expect(parseNodeHeader('main')).toEqual({ role: 'main', attrs: {} });
  });

  it('rejects strings that are not node headers', () => {
    expect(parseNodeHeader('Hello world, this is text')).toBeNull();
    expect(parseNodeHeader('')).toBeNull();
  });
});
