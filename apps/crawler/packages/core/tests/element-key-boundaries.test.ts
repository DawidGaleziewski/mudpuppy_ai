import { describe, expect, it } from 'vitest';
import {
  KEYED_ROLES,
  elementKeys,
  fromAriaJson,
  parseAriaYaml,
  parseNodeHeader,
  walkKeyed,
} from '../src/element-key.js';

/**
 * Exact trees and keys at the edges of the ARIA parsers (spec 012 F-12): the golden fixtures cover
 * the common page shapes; these pin every keyed role, each header/attribute variant and the
 * nodes the parsers must drop. `toStrictEqual` so an `undefined` property counts as a difference.
 */

describe('keyed roles', () => {
  it.each([...KEYED_ROLES])('%s is keyed', (role) => {
    expect(elementKeys(parseAriaYaml(`- ${role} "n"`)).map((e) => e.key)).toEqual([`${role} "n"`]);
  });

  it('the list has every role the contract names, and no more', () => {
    expect(KEYED_ROLES.size).toBe(28);
  });
});

describe('parseNodeHeader variants', () => {
  it.each([
    ['  button "x"  ', { role: 'button', name: 'x', attrs: {} }],
    ['button  "x"', { role: 'button', name: 'x', attrs: {} }],
    [
      'heading "x" [ level = 12 ]  [ checked ]',
      { role: 'heading', name: 'x', attrs: { level: '12', checked: true } },
    ],
    ['button "a\\x"', { role: 'button', name: 'a\\x', attrs: {} }],
    ['main [expanded]', { role: 'main', attrs: { expanded: true } }],
  ])('%j', (header, parsed) => {
    expect(parseNodeHeader(header)).toStrictEqual(parsed);
  });
});

describe('parseAriaYaml', () => {
  it('reads inline text from strings, numbers and booleans, and none from children', () => {
    expect(
      parseAriaYaml(
        '- spinbutton "n": 5\n- checkbox "c": true\n- paragraph: Hi\n- list:\n  - listitem: a',
      ),
    ).toStrictEqual([
      { role: 'spinbutton', name: 'n', attrs: {}, text: '5', children: [] },
      { role: 'checkbox', name: 'c', attrs: {}, text: 'true', children: [] },
      { role: 'paragraph', attrs: {}, text: 'Hi', children: [] },
      {
        role: 'list',
        attrs: {},
        children: [{ role: 'listitem', attrs: {}, text: 'a', children: [] }],
      },
    ]);
  });

  it('keeps text nodes and a regex-named node with children', () => {
    expect(parseAriaYaml('- text: hello\n- text: 7\n- link /Więcej/:\n  - /url: /x')).toStrictEqual(
      [
        { role: 'text', attrs: {}, text: 'hello', children: [] },
        { role: 'text', attrs: {}, text: '7', children: [] },
        { role: 'link', name: '/Więcej/', attrs: {}, children: [] },
      ],
    );
  });

  it('drops nulls, nested lists, multi-key maps, non-text text values and non-headers', () => {
    expect(
      parseAriaYaml(
        '- ~\n- - a\n- a: 1\n  b: 2\n- text:\n  - x\n- Hello world: x\n- Hello world\n- button',
      ),
    ).toStrictEqual([{ role: 'button', attrs: {}, children: [] }]);
  });

  it('returns [] when the YAML does not parse or is not a list', () => {
    expect(parseAriaYaml('"unterminated')).toStrictEqual([]);
    expect(parseAriaYaml('a: 1')).toStrictEqual([]);
  });
});

describe('fromAriaJson', () => {
  it('maps strings to text nodes and omits empty names', () => {
    expect(
      fromAriaJson([
        'hello',
        { role: 'button', name: '' },
        { role: 'textbox', name: 'Q', text: 'v', children: ['t'] },
      ]),
    ).toStrictEqual([
      { role: 'text', attrs: {}, text: 'hello', children: [] },
      { role: 'button', attrs: {}, children: [] },
      {
        role: 'textbox',
        name: 'Q',
        attrs: {},
        text: 'v',
        children: [{ role: 'text', attrs: {}, text: 't', children: [] }],
      },
    ]);
  });
});

describe('walkKeyed', () => {
  it('accepts nodes without a children array', () => {
    const keys: string[] = [];
    walkKeyed([{ role: 'button', name: 'x' }], (_n, el) => keys.push(el.key));
    expect(keys).toEqual(['button "x"']);
  });
});
