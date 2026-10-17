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
  /**
   * The page marks the control invalid (`[invalid]`, from `aria-invalid`; spec 032 US1). Not part
   * of the level-1 text, so state identity does not change.
   */
  invalid?: boolean;
  /**
   * A heading's or text's words as shown (not masked): a form step's label and a message quoted
   * verbatim (spec 032). Never part of the level-1 text.
   */
  shown?: string;
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

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

export function maskVolatile(text: string): string {
  let out = text.replace(/\s+/g, ' ').trim();
  for (const [re, repl] of MASKS) out = out.replace(re, repl);
  return out;
}

// role, optional "name", optional [attrs], optional `:` with optional inline text
const LINE = /^([a-z][a-z0-9-]*)(?: "((?:[^"\\]|\\.)*)")?((?: \[[^\]]*\])*)(?::(?: (.*))?)?$/;

/**
 * Playwright writes a node whose text holds a colon as a YAML single-quoted key
 * (`'heading "Step 1 of 3: your details" [level=2]'`, `''` escapes a quote). Unquoted here so the
 * node is read like any other; such lines used to be dropped from the fingerprint (F-05@032).
 */
export function unquoteYamlKey(content: string): string {
  if (!content.startsWith("'")) return content;
  for (let i = 1; i < content.length; i++) {
    if (content[i] !== "'") continue;
    if (content[i + 1] === "'") {
      i++;
      continue;
    }
    return content.slice(1, i).replace(/''/g, "'") + content.slice(i + 1);
  }
  return content;
}

/** An inline value YAML-quoted for the same reason (`text: "Error: E-17"`), as the page shows it. */
function unquoteValue(v: string | undefined): string | undefined {
  if (v === undefined || v.length < 2) return v;
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  if (v.startsWith('"') && v.endsWith('"')) {
    try {
      return JSON.parse(v) as string;
    } catch {
      return v.slice(1, -1);
    }
  }
  return v;
}

/** The level-1 text: role, masked name and heading level only (`invalid`/`shown` stay out). */
function levelOneText(nodes: readonly AriaNode[]): string {
  return nodes
    .map(
      (n) =>
        `${'  '.repeat(n.path.length)}${n.role}${n.name ? ` "${n.name}"` : ''}${n.level ? ` [level=${n.level}]` : ''}`,
    )
    .join('\n');
}

export function canonicalizeAria(snapshot: string): CanonicalAria {
  const nodes: AriaNode[] = [];
  const stack: { depth: number; role: string }[] = [];

  for (const line of snapshot.split(/\r?\n/)) {
    const m = /^(\s*)- (.*)$/.exec(line);
    if (!m) continue;
    const depth = Math.floor(m[1]!.length / 2);
    const content = unquoteYamlKey(m[2]!.trim());
    if (content.startsWith('/')) continue; // props such as `/url:` — not structure

    const parsed = LINE.exec(content);
    if (!parsed) continue;
    const [, role = '', quoted, attrs = '', rawInline] = parsed;
    const inline = unquoteValue(rawInline);

    while (stack.length && stack[stack.length - 1]!.depth >= depth) stack.pop();
    const path = stack.map((s) => s.role);
    const level = /\[level=(\d+)\]/.exec(attrs)?.[1];

    if (role === 'text') {
      const raw = inline ?? quoted ?? '';
      nodes.push({ role, name: maskVolatile(raw), shown: collapse(raw), path });
      continue;
    }
    nodes.push({
      role,
      name: maskVolatile(quoted ?? ''),
      ...(level ? { level: Number(level) } : {}),
      ...(/\[invalid\]/.test(attrs) ? { invalid: true } : {}),
      ...(role === 'heading' && quoted ? { shown: collapse(quoted) } : {}),
      path,
    });
    if (inline)
      nodes.push({
        role: 'text',
        name: maskVolatile(inline),
        shown: collapse(inline),
        path: [...path, role],
      });
    stack.push({ depth, role });
  }

  const text = levelOneText(nodes);
  const overlays = nodes
    .filter((n) => OVERLAY_ROLES.has(n.role))
    .map((n) => `${n.role}:${n.name}`)
    .sort();

  return { nodes, text, overlays };
}
