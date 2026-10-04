import { parse } from 'yaml';

/**
 * Element keys (spec 008, contracts/element-key.md): one deterministic name per notable element of
 * a recorded page, computed the same way from the stored ARIA YAML snapshot and from Playwright's
 * `ariaSnapshotJSON` tree. It joins layout boxes, BA screen-region citations, dashboard highlights
 * and wireframe shapes.
 */

/** One node of an ARIA tree. Static text is `{ role: 'text', text }`. */
export interface AriaNode {
  role: string;
  name?: string;
  /** `[level=1]` → `{ level: '1' }`, `[checked]` → `{ checked: true }`. */
  attrs: Record<string, string | true>;
  /** Inline text content (`- paragraph: Hello`, `- textbox "x": "1600"`, text nodes). */
  text?: string;
  children: AriaNode[];
}

export interface KeyedElement {
  key: string;
  role: string;
  name: string;
  /** Index in pre-order over keyed nodes, from 0. */
  index: number;
}

export const KEYED_ROLES: ReadonlySet<string> = new Set([
  'heading',
  'button',
  'link',
  'textbox',
  'searchbox',
  'spinbutton',
  'combobox',
  'listbox',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'tab',
  'menuitem',
  'option',
  'img',
  'table',
  'list',
  'form',
  'dialog',
  'alert',
  'banner',
  'navigation',
  'main',
  'contentinfo',
  'complementary',
  'region',
  'search',
]);

export const MAX_KEYED_ELEMENTS = 400;
const MAX_NAME = 80;

/** `role "name" [a] [b=c]` (name may also be `/regex/`); null when the string is not a node header. */
export function parseNodeHeader(
  header: string,
): { role: string; name?: string; attrs: Record<string, string | true> } | null {
  const m =
    /^([a-z][a-z-]*)(?:\s+("(?:[^"\\]|\\.)*"|\/(?:[^/\\]|\\.)*\/))?((?:\s*\[[^\]]*\])*)\s*$/.exec(
      header.trim(),
    );
  if (!m) return null;
  const [, role, rawName, rawAttrs] = m;
  const attrs: Record<string, string | true> = {};
  for (const a of (rawAttrs ?? '').matchAll(/\[([^\]=]+)(?:=([^\]]*))?\]/g)) {
    const k = a[1]!.trim();
    attrs[k] = a[2] === undefined ? true : a[2].trim();
  }
  let name: string | undefined;
  if (rawName !== undefined) {
    if (rawName.startsWith('"')) {
      try {
        name = JSON.parse(rawName) as string;
      } catch {
        name = rawName.slice(1, -1);
      }
    } else name = rawName;
  }
  return { role: role!, ...(name !== undefined ? { name } : {}), attrs };
}

function textOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function fromYamlItem(item: unknown): AriaNode | null {
  if (typeof item === 'string') {
    const h = parseNodeHeader(item);
    return h ? { ...h, children: [] } : null;
  }
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return null;
  const entries = Object.entries(item as Record<string, unknown>);
  if (entries.length !== 1) return null;
  const [header, value] = entries[0]!;
  if (header.startsWith('/')) return null; // property such as `/url: /`
  if (header === 'text') {
    const t = textOf(value);
    return t === undefined ? null : { role: 'text', attrs: {}, text: t, children: [] };
  }
  const h = parseNodeHeader(header);
  if (!h) return null;
  const text = textOf(value);
  const children = Array.isArray(value) ? fromYamlList(value) : [];
  return { ...h, ...(text !== undefined ? { text } : {}), children };
}

function fromYamlList(items: readonly unknown[]): AriaNode[] {
  const out: AriaNode[] = [];
  for (const item of items) {
    const n = fromYamlItem(item);
    if (n) out.push(n);
  }
  return out;
}

/** Parse a stored Playwright ARIA YAML snapshot into a tree. An empty or invalid snapshot is `[]`. */
export function parseAriaYaml(yaml: string): AriaNode[] {
  let doc: unknown;
  try {
    doc = parse(yaml);
  } catch {
    return [];
  }
  return Array.isArray(doc) ? fromYamlList(doc) : [];
}

/** A node of `locator.ariaSnapshotJSON()` (strings are static text). */
export type AriaJsonNode =
  | string
  | {
      role: string;
      name?: string;
      text?: string;
      children?: AriaJsonNode[];
      box?: { x: number; y: number; width: number; height: number };
      [prop: string]: unknown;
    };

/** Convert an `ariaSnapshotJSON` tree to {@link AriaNode}s (boxes are read separately by the layout). */
export function fromAriaJson(nodes: readonly AriaJsonNode[]): AriaNode[] {
  return nodes.map((n) =>
    typeof n === 'string'
      ? { role: 'text', attrs: {}, text: n, children: [] }
      : {
          role: n.role,
          ...(n.name !== undefined && n.name !== '' ? { name: n.name } : {}),
          attrs: {},
          ...(n.text !== undefined ? { text: n.text } : {}),
          children: fromAriaJson(n.children ?? []),
        },
  );
}

export function collapseName(name: string | undefined): string {
  return (name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

/**
 * Walk pre-order and visit every keyed node of `nodes`, calling `visit` with its key. Non-keyed
 * nodes are skipped but their children are walked. Stops keying after {@link MAX_KEYED_ELEMENTS}.
 */
export function walkKeyed<N extends { role: string; name?: string; children?: readonly N[] }>(
  nodes: readonly N[],
  visit: (node: N, el: KeyedElement) => void,
): void {
  const seen = new Map<string, number>();
  let index = 0;
  const walk = (list: readonly N[]): void => {
    for (const n of list) {
      if (index < MAX_KEYED_ELEMENTS && KEYED_ROLES.has(n.role)) {
        const name = collapseName(n.name);
        const base = name === '' ? n.role : `${n.role} ${JSON.stringify(name)}`;
        const count = (seen.get(base) ?? 0) + 1;
        seen.set(base, count);
        visit(n, { key: count === 1 ? base : `${base}#${count}`, role: n.role, name, index });
        index += 1;
      }
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
}

/** Keyed elements of a tree in document order (contracts/element-key.md). */
export function elementKeys(nodes: readonly AriaNode[]): KeyedElement[] {
  const out: KeyedElement[] = [];
  walkKeyed(nodes, (_n, el) => out.push(el));
  return out;
}
