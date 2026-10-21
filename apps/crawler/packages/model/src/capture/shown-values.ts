/**
 * Shown values (spec 039 design § 5.8): label–value pairs a page shows, read from the raw ARIA
 * snapshot (values unmasked, since rules depend on them): definition lists (term + definition),
 * tables (column header + cell), and "label: value" text. Pure.
 */

export interface ShownValue {
  label: string;
  value: string;
}

interface Line {
  depth: number;
  role: string;
  text: string;
}

const LINE =
  /^(\s*)- (?:'((?:[^']|'')*)'|([a-z][a-z0-9-]*)(?: "((?:[^"\\]|\\.)*)")?(?: \[[^\]]*\])*(?::(?: (.*))?)?)\s*$/;

function unquote(v: string | undefined): string {
  if (!v) return '';
  const t = v.trim();
  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      return JSON.parse(t) as string;
    } catch {
      return t.slice(1, -1);
    }
  }
  if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  return t;
}

function parse(snapshot: string): Line[] {
  const out: Line[] = [];
  for (const raw of snapshot.split(/\r?\n/)) {
    const m = LINE.exec(raw);
    if (!m) continue;
    const depth = Math.floor(m[1]!.length / 2);
    if (m[2] !== undefined) {
      // a YAML-quoted key: `'text: Składka: 1 234 zł'`
      const inner = m[2].replace(/''/g, "'");
      const role = /^([a-z][a-z0-9-]*)/.exec(inner)?.[1] ?? 'text';
      const rest = inner
        .slice(role.length)
        .replace(/^ "((?:[^"\\]|\\.)*)"/, '$1')
        .replace(/^:\s*/, '');
      out.push({ depth, role, text: rest.trim() });
      continue;
    }
    const role = m[3]!;
    if (role.startsWith('/')) continue;
    out.push({ depth, role, text: (m[4] ? unquote(`"${m[4]}"`) : '') || unquote(m[5]) });
  }
  return out;
}

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();
const LABEL_VALUE = /^([^:]{1,60}):\s+(.{1,120})$/;

type Push = (label: string, value: string) => void;

/** The direct children of line `at` (lines one level deeper until the subtree ends). */
function childrenOf(lines: readonly Line[], at: number): Line[] {
  const depth = lines[at]!.depth;
  const out: Line[] = [];
  for (let k = at + 1; k < lines.length && lines[k]!.depth > depth; k++)
    if (lines[k]!.depth === depth + 1) out.push(lines[k]!);
  return out;
}

/** A table's pairs: the header row's column headers, then each row's cells by position. */
function tablePairs(lines: readonly Line[], at: number, push: Push): void {
  const depth = lines[at]!.depth;
  let headers: string[] = [];
  for (let j = at + 1; j < lines.length && lines[j]!.depth > depth; j++) {
    if (lines[j]!.role !== 'row') continue;
    const cells = childrenOf(lines, j);
    if (cells.length && cells.every((c) => c.role === 'columnheader')) {
      headers = cells.map((c) => c.text);
      continue;
    }
    cells.forEach((c, n) => {
      const header = headers[n];
      if (c.role === 'cell' && header) push(header, c.text);
    });
    const [head, value] = cells;
    if (!headers.length && cells.length === 2 && head?.role === 'rowheader' && value)
      push(head.text, value.text);
  }
}

export function shownValues(snapshot: string): ShownValue[] {
  const lines = parse(snapshot);
  const out: ShownValue[] = [];
  const push: Push = (label, value) => {
    const l = clean(label).replace(/:$/, '');
    const v = clean(value);
    if (l && v && l.length <= 60) out.push({ label: l, value: v });
  };
  lines.forEach((l, i) => {
    const next = lines[i + 1];
    // definition list: term followed by definition at the same depth
    if (l.role === 'term' && next?.role === 'definition' && next.depth === l.depth)
      push(l.text, next.text);
    // "label: value" text or paragraph
    const m = (l.role === 'text' || l.role === 'paragraph') && LABEL_VALUE.exec(l.text);
    if (m) push(m[1]!, m[2]!);
  });
  lines.forEach((l, i) => {
    if (l.role === 'table') tablePairs(lines, i, push);
  });
  return out;
}
