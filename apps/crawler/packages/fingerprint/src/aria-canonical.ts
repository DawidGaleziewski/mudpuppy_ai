/**
 * Canonicalization of Playwright-style ARIA snapshots (YAML-ish text) for fingerprinting.
 * Pure. Drops non-structural noise (ref ids, /url props, state flags) and masks volatile content
 * (prices, counters, timestamps) so reruns of the same state canonicalize identically.
 */

export interface AriaNode {
  role: string;
  /** Whitespace-collapsed and volatile-masked accessible name / text. */
  name: string;
  level?: number;
  /** Roles of the ancestors, outermost first. */
  path: string[];
}

export interface CanonicalAria {
  nodes: AriaNode[];
  /** Deterministic, indented rendering of the canonical tree (input to the level-1 hash). */
  text: string;
  /** Open overlays as `role:name`, sorted (dialogs and alert dialogs). */
  overlays: string[];
}

const OVERLAY_ROLES = new Set(['dialog', 'alertdialog']);

const CURRENCY = String.raw`(?:zł|pln|eur|usd|gbp|€|\$|£)`;
const MASKS: readonly [RegExp, string][] = [
  [/\d{4}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?)?/g, '<time>'],
  [/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '<time>'],
  [/\b\d+\s*\p{L}+\.?\s+(?:temu|ago)\b/giu, '<time>'],
  [new RegExp(String.raw`\d(?:[\d\s.,]*\d)?\s*${CURRENCY}(?![\p{L}])`, 'giu'), '<price>'],
  [new RegExp(String.raw`${CURRENCY}\s*\d(?:[\d\s.,]*\d)?`, 'giu'), '<price>'],
  [/\d+(?:[.,]\d+)*/g, '<n>'],
];

export function maskVolatile(text: string): string {
  let out = text.replace(/\s+/g, ' ').trim();
  for (const [re, repl] of MASKS) out = out.replace(re, repl);
  return out;
}

// role, optional "name", optional [attrs], optional `:` with optional inline text
const LINE = /^([a-z][a-z0-9-]*)(?: "((?:[^"\\]|\\.)*)")?((?: \[[^\]]*\])*)(?::(?: (.*))?)?$/;

export function canonicalizeAria(snapshot: string): CanonicalAria {
  const nodes: AriaNode[] = [];
  const stack: { depth: number; role: string }[] = [];

  for (const line of snapshot.split(/\r?\n/)) {
    const m = /^(\s*)- (.*)$/.exec(line);
    if (!m) continue;
    const depth = Math.floor(m[1]!.length / 2);
    const content = m[2]!.trim();
    if (content.startsWith('/')) continue; // props such as `/url:` — not structure

    const parsed = LINE.exec(content);
    if (!parsed) continue;
    const [, role = '', quoted, attrs = '', inline] = parsed;

    while (stack.length && stack[stack.length - 1]!.depth >= depth) stack.pop();
    const path = stack.map((s) => s.role);
    const level = /\[level=(\d+)\]/.exec(attrs)?.[1];

    if (role === 'text') {
      nodes.push({ role, name: maskVolatile(inline ?? quoted ?? ''), path });
      continue;
    }
    nodes.push({
      role,
      name: maskVolatile(quoted ?? ''),
      ...(level ? { level: Number(level) } : {}),
      path,
    });
    if (inline) nodes.push({ role: 'text', name: maskVolatile(inline), path: [...path, role] });
    stack.push({ depth, role });
  }

  const text = nodes
    .map(
      (n) =>
        `${'  '.repeat(n.path.length)}${n.role}${n.name ? ` "${n.name}"` : ''}${n.level ? ` [level=${n.level}]` : ''}`,
    )
    .join('\n');
  const overlays = nodes
    .filter((n) => OVERLAY_ROLES.has(n.role))
    .map((n) => `${n.role}:${n.name}`)
    .sort();

  return { nodes, text, overlays };
}
