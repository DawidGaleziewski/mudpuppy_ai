/**
 * Fingerprint v2 structure (spec 039 design § 5.4–5.5): the canonical ARIA nodes as a tree, a
 * structural signature per subtree (roles only, names excluded, bottom-up), runs of two or more
 * consecutive siblings with the same signature collapsed into one node marked repeated (repeated
 * rows are data, so their text leaves identity), and element keys for every actionable element.
 * Pure and deterministic.
 */
import { createHash } from 'node:crypto';
import type { AriaNode } from './aria-canonical.js';

export interface TreeNode {
  node: AriaNode;
  children: TreeNode[];
  parent: TreeNode | null;
  /** Structural signature: hash of the role, heading level and children's signatures. */
  signature: string;
}

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

/** Rebuild the tree from canonical nodes (document order; depth = ancestor count). */
export function buildTree(nodes: readonly AriaNode[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const stack: TreeNode[] = [];
  for (const node of nodes) {
    const depth = node.path.length;
    while (stack.length > depth) stack.pop();
    const parent = stack[stack.length - 1] ?? null;
    const t: TreeNode = { node, children: [], parent, signature: '' };
    (parent ? parent.children : roots).push(t);
    stack.push(t);
  }
  const sign = (t: TreeNode): string => {
    const kids = t.children.map(sign).join(',');
    t.signature = sha(`${t.node.role}${t.node.level ? `/${t.node.level}` : ''}(${kids})`);
    return t.signature;
  };
  roots.forEach(sign);
  return roots;
}

/** Roles whose siblings are rows of data even when each holds only text. */
const ROW_ROLES = new Set(['listitem', 'row', 'article', 'option', 'treeitem']);

const holdsStructure = (t: TreeNode): boolean =>
  t.children.some((c) => c.node.role !== 'text' || holdsStructure(c));

/**
 * Whether siblings like `t` are rows of data when they repeat: a row role, or a subtree with more
 * than text. Leaves (two textboxes, three menu links, two paragraphs) never collapse: their names
 * are the page's structure (a form's fields), not repeated data.
 */
const rowLike = (t: TreeNode): boolean => ROW_ROLES.has(t.node.role) || holdsStructure(t);

/** Siblings grouped into runs of equal signature; a run of two or more row-like nodes is repeated. */
function runs(siblings: readonly TreeNode[]): TreeNode[][] {
  const out: TreeNode[][] = [];
  for (const s of siblings) {
    const last = out[out.length - 1];
    if (last && last[0]!.signature === s.signature && rowLike(s)) last.push(s);
    else out.push([s]);
  }
  return out;
}

export interface CollapsedText {
  /** Roles, levels and masked names, repeated runs as one nameless node (level-1 input). */
  identity: string;
  /** Roles and levels only, repeated runs collapsed. */
  structure: string;
  /** Masked names and text outside repeated runs, in document order. */
  content: string;
}

/** Render the collapsed tree. A repeated run never says how many members it has. */
export function collapsedText(roots: readonly TreeNode[]): CollapsedText {
  const identity: string[] = [];
  const structure: string[] = [];
  const content: string[] = [];
  const label = (n: AriaNode, named: boolean): string =>
    `${n.role}${named && n.name ? ` "${n.name}"` : ''}${n.level ? ` [level=${n.level}]` : ''}`;
  const walk = (siblings: readonly TreeNode[], depth: number, inRepeat: boolean): void => {
    for (const run of runs(siblings)) {
      const head = run[0]!;
      const repeated = inRepeat || run.length > 1;
      const indent = '  '.repeat(depth);
      const mark = run.length > 1 ? ' [repeated]' : '';
      identity.push(`${indent}${label(head.node, !repeated)}${mark}`);
      structure.push(`${indent}${label(head.node, false)}${mark}`);
      if (!repeated && head.node.name) content.push(head.node.name);
      walk(head.children, depth + 1, repeated);
    }
  };
  walk(roots, 0, false);
  return {
    identity: identity.join('\n'),
    structure: structure.join('\n'),
    content: content.join('\n'),
  };
}

/** Roles an element key is computed for: clickable roles plus the fillable ones. */
export const ACTIONABLE_ROLES: ReadonlySet<string> = new Set([
  'link',
  'button',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'checkbox',
  'radio',
  'switch',
  'treeitem',
  'option',
  'combobox',
  'textbox',
  'searchbox',
  'spinbutton',
  'slider',
]);

/** Roles that form an element's container path. */
const CONTAINER_ROLES = new Set([
  'banner',
  'navigation',
  'main',
  'contentinfo',
  'complementary',
  'region',
  'search',
  'form',
  'dialog',
  'alertdialog',
]);

export interface ElementKey {
  role: string;
  /** The masked accessible name as the ARIA tree has it (not lower-cased). */
  name: string;
  /** Position among elements of the same role and name on the page (the extractor's `nth`). */
  nth: number;
  /** `role|masked name|container path|ordinal`. */
  key: string;
}

const keyName = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
const containerLabel = (n: AriaNode): string => (n.name ? `${n.role} "${n.name}"` : n.role);

/**
 * Element keys of every actionable element (design § 5.5), in document order. Container path =
 * the container ancestors outermost first, then the nearest heading above the element inside its
 * innermost container (or an enclosing one). Ordinal only when the role, name and container repeat.
 * Options of a native select (directly under a combobox) are skipped, as the extractor skips them.
 */
export function elementKeys(roots: readonly TreeNode[]): ElementKey[] {
  type Frame = { heading: string | null };
  const found: { role: string; name: string; container: string }[] = [];
  const walk = (siblings: readonly TreeNode[], containers: string[], frames: Frame[]): void => {
    for (const t of siblings) {
      const n = t.node;
      if (n.role === 'heading') frames[frames.length - 1]!.heading = `heading "${n.name}"`;
      const selectOption = n.role === 'option' && t.parent?.node.role === 'combobox';
      if (ACTIONABLE_ROLES.has(n.role) && !selectOption) {
        const heading = [...frames].reverse().find((f) => f.heading)?.heading;
        found.push({
          role: n.role,
          name: n.name,
          container: [...containers, ...(heading ? [heading] : [])].join('>'),
        });
      }
      if (CONTAINER_ROLES.has(n.role))
        walk(t.children, [...containers, containerLabel(n)], [...frames, { heading: null }]);
      else walk(t.children, containers, frames);
    }
  };
  walk(roots, [], [{ heading: null }]);

  const total = new Map<string, number>();
  for (const f of found) {
    const k = `${f.role}|${keyName(f.name)}|${f.container}`;
    total.set(k, (total.get(k) ?? 0) + 1);
  }
  const seenKey = new Map<string, number>();
  const seenNth = new Map<string, number>();
  return found.map((f) => {
    const base = `${f.role}|${keyName(f.name)}|${f.container}`;
    const ordinal = seenKey.get(base) ?? 0;
    seenKey.set(base, ordinal + 1);
    const nthKey = `${f.role}\u0000${f.name}`;
    const nth = seenNth.get(nthKey) ?? 0;
    seenNth.set(nthKey, nth + 1);
    return {
      role: f.role,
      name: f.name,
      nth,
      key: `${base}|${total.get(base)! > 1 ? ordinal + 1 : ''}`,
    };
  });
}
