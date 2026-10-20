/**
 * Fingerprint v2 structure (spec 039 design § 5.4–5.5): the canonical ARIA nodes as a tree, a
 * structural signature per subtree (roles only, names excluded, bottom-up), runs of two or more
 * consecutive siblings with the same signature collapsed into one node marked repeated (repeated
 * rows are data, so their text leaves identity), and element keys for every actionable element.
 * Pure and deterministic.
 */
import { createHash } from 'node:crypto';
import type { AriaNode } from './aria-canonical.js';
import { ROWS_V2, type FingerprintRules } from './profile.js';

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

/** The profile's role lists as sets (spec 039 T111). */
interface RoleSets {
  rows: ReadonlySet<string>;
  fields: ReadonlySet<string>;
  ignored: ReadonlySet<string>;
}

const roleSets = (rules: FingerprintRules): RoleSets => ({
  rows: new Set(rules.row_roles),
  fields: new Set(rules.field_roles),
  ignored: new Set(rules.ignore_names_in),
});

const holdsStructure = (t: TreeNode): boolean =>
  t.children.some((c) => c.node.role !== 'text' || holdsStructure(c));

/**
 * Whether siblings like `t` are rows of data when they repeat: a row role, or a subtree with more
 * than text. Leaves (two textboxes, three menu links, two paragraphs) never collapse: their names
 * are the page's structure (a form's fields), not repeated data.
 */
const rowLike = (t: TreeNode, roles: RoleSets): boolean =>
  roles.rows.has(t.node.role) || holdsStructure(t);

/** The names of the form fields in a subtree, in document order. */
function fieldNames(t: TreeNode, roles: RoleSets): string {
  const out: string[] = [];
  const walk = (n: TreeNode) => {
    if (roles.fields.has(n.node.role)) out.push(n.node.name);
    n.children.forEach(walk);
  };
  walk(t);
  return out.join('\u0000');
}

/**
 * Siblings grouped into runs of equal signature; a run of two or more row-like nodes is repeated.
 * Rows also need the same field names: a form whose fields each sit in a paragraph is a form, not
 * repeated rows (F-26@039); driver rows that each ask for a name and a year are rows. Inside a
 * container whose names the profile ignores, any run of equal signatures is one (T111@039).
 */
function runs(siblings: readonly TreeNode[], roles: RoleSets, ignored: boolean): TreeNode[][] {
  const out: TreeNode[][] = [];
  for (const s of siblings) {
    const last = out[out.length - 1];
    const same =
      last !== undefined &&
      last[0]!.signature === s.signature &&
      (ignored || (rowLike(s, roles) && fieldNames(last[0]!, roles) === fieldNames(s, roles)));
    if (same) last.push(s);
    else out.push([s]);
  }
  return out;
}

export interface CollapsedText {
  /** Roles, levels and masked names, repeated runs as one nameless node (level-1 input). */
  identity: string;
  /** Roles and levels, and the names of form fields; repeated runs collapsed. */
  structure: string;
  /** Masked names and text outside repeated runs, in document order. */
  content: string;
}

/**
 * Render the collapsed tree under the profile's rules (`rows-v2` by default). A repeated run never
 * says how many members it has. Inside an ignored container (`ignore_names_in`) names count for
 * nothing, so the container stays the same when it gains or loses a link.
 */
export function collapsedText(
  roots: readonly TreeNode[],
  rules: FingerprintRules = ROWS_V2,
): CollapsedText {
  const roles = roleSets(rules);
  const identity: string[] = [];
  const structure: string[] = [];
  const content: string[] = [];
  const label = (n: AriaNode, named: boolean): string =>
    `${n.role}${named && n.name ? ` "${n.name}"` : ''}${n.level ? ` [level=${n.level}]` : ''}`;
  const walk = (
    siblings: readonly TreeNode[],
    depth: number,
    inRepeat: boolean,
    ignored: boolean,
  ): void => {
    for (const run of runs(siblings, roles, ignored)) {
      const head = run[0]!;
      const repeated = inRepeat || run.length > 1;
      const quiet = ignored || roles.ignored.has(head.node.role);
      const indent = '  '.repeat(depth);
      const mark = run.length > 1 ? ' [repeated]' : '';
      identity.push(`${indent}${label(head.node, !repeated && !quiet)}${mark}`);
      // A form's field names are its structure (what it asks for), unlike item text (F-27@039).
      const field = roles.fields.has(head.node.role) && !quiet;
      structure.push(`${indent}${label(head.node, field)}${mark}`);
      if (!repeated && !quiet && head.node.name) content.push(head.node.name);
      walk(head.children, depth + 1, repeated, quiet);
    }
  };
  walk(roots, 0, false, false);
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

/**
 * The element key of each extracted action, in order (spec 039 design § 5.5). `keys` come from
 * `modelElementKeys` over the snapshot the actions were extracted from; an action matches the k-th
 * key with its role and masked name when it is the k-th action with them (both walk the snapshot in
 * document order, frame blocks included). An action ARIA does not see (a role-less clickable) gets
 * `role|masked name|frame|nth`.
 */
export function keysForActions(
  keys: readonly ModelElementKey[],
  actions: readonly { role: string; maskedName: string; frame?: string; nth: number }[],
): string[] {
  const byName = new Map<string, ModelElementKey[]>();
  for (const k of keys) {
    const id = `${k.role}\u0000${k.name}`;
    byName.set(id, [...(byName.get(id) ?? []), k]);
  }
  const used = new Map<string, number>();
  return actions.map((a) => {
    const id = `${a.role}\u0000${a.maskedName}`;
    const k = used.get(id) ?? 0;
    used.set(id, k + 1);
    return (
      byName.get(id)?.[k]?.key ??
      `${a.role}|${a.maskedName.toLowerCase().replace(/\s+/g, ' ').trim()}|${a.frame ?? ''}|${a.nth}`
    );
  });
}

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

/**
 * A model element key (spec 039, column `element_key`). Not core's `elementKeys` (spec 008, the
 * `role:name#n` names of layout regions and screen-region citations): F-08@039.
 */
export interface ModelElementKey {
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
export function modelElementKeys(roots: readonly TreeNode[]): ModelElementKey[] {
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
