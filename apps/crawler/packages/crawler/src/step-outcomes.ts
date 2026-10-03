/**
 * Observed outcomes of one trace step (R-14, data-model.md `process_steps.outcomes_json`): a pure
 * comparison of the page before and after the step. Facts only, no interpretation, and no values
 * (query strings are reported by parameter name) so nothing the portal echoed back is stored.
 *
 * Order is fixed: title, route/URL, dialogs, alerts and validation messages, element counts.
 */

export interface StepSide {
  url: string;
  /** Document title when known; the title line is omitted if either side lacks one. */
  title?: string | null;
  /** Playwright ARIA snapshot (already scrubbed or not: only roles and text are read). */
  snapshot: string;
}

interface Node {
  depth: number;
  role: string;
  name: string | null;
  /** Inline text after the colon, e.g. `- listitem: Podaj imię.`. */
  text: string | null;
}

const LINE = /^(\s*)- ([a-z][a-z0-9-]*)(?: "((?:[^"\\]|\\.)*)")?((?: \[[^\]]*\])*)(:)?(?: (.*))?$/;
const unescape = (s: string): string => s.replace(/\\(.)/g, '$1');

function parse(snapshot: string): Node[] {
  const out: Node[] = [];
  for (const line of snapshot.split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (!m) continue; // `/url:` properties and anything else that is not a node
    const rest = m[6]?.trim();
    out.push({
      depth: Math.floor(m[1]!.length / 2),
      role: m[2]!,
      name: m[3] !== undefined ? unescape(m[3]) : null,
      text: rest ? rest.replace(/^"(.*)"$/, '$1') : null,
    });
  }
  return out;
}

/** Roles whose count is reported; layout-only roles (generic, list, text...) would only add noise. */
const COUNTED = [
  'button',
  'checkbox',
  'combobox',
  'form',
  'heading',
  'img',
  'link',
  'listitem',
  'radio',
  'row',
  'searchbox',
  'spinbutton',
  'table',
  'textbox',
] as const;

const label = (n: Node): string => n.name ?? n.text ?? '';

function counts(nodes: readonly Node[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const n of nodes) m.set(n.role, (m.get(n.role) ?? 0) + 1);
  return m;
}

interface Alert {
  summary: string;
  messages: string[];
}

/** An alert's own name/text or its first direct paragraph/text child, plus its list items. */
function alertsOf(nodes: readonly Node[]): Alert[] {
  const out: Alert[] = [];
  nodes.forEach((n, i) => {
    if (n.role !== 'alert') return;
    const subtree: Node[] = [];
    for (let j = i + 1; j < nodes.length && nodes[j]!.depth > n.depth; j++) subtree.push(nodes[j]!);
    const own = label(n);
    const direct = subtree.find(
      (c) => c.depth === n.depth + 1 && (c.role === 'paragraph' || c.role === 'text') && label(c),
    );
    out.push({
      summary: own || (direct ? label(direct) : ''),
      messages: subtree.filter((c) => c.role === 'listitem' && label(c)).map(label),
    });
  });
  return out;
}

/** Items of `after` not matched by an item of `before` (multiset difference, `after` order kept). */
function added(before: readonly string[], after: readonly string[]): string[] {
  const pool = new Map<string, number>();
  for (const b of before) pool.set(b, (pool.get(b) ?? 0) + 1);
  return after.filter((a) => {
    const left = pool.get(a) ?? 0;
    if (left > 0) {
      pool.set(a, left - 1);
      return false;
    }
    return true;
  });
}

const BASE = 'http://placeholder.invalid';

function parseUrl(url: string): URL | null {
  try {
    return new URL(url, BASE);
  } catch {
    return null;
  }
}

function urlOutcomes(beforeUrl: string, afterUrl: string): string[] {
  const a = parseUrl(beforeUrl);
  const b = parseUrl(afterUrl);
  if (!a || !b)
    return beforeUrl === afterUrl ? [] : [`URL changed from ${beforeUrl} to ${afterUrl}`];
  if (a.origin !== b.origin) return [`Origin changed from ${a.origin} to ${b.origin}`];
  if (a.pathname !== b.pathname) return [`Route changed from ${a.pathname} to ${b.pathname}`];
  const out: string[] = [];
  const names = (u: URL): Map<string, string[]> => {
    const m = new Map<string, string[]>();
    for (const [k, v] of u.searchParams) m.set(k, [...(m.get(k) ?? []), v]);
    return m;
  };
  const qa = names(a);
  const qb = names(b);
  const changed = [...new Set([...qa.keys(), ...qb.keys()])]
    .filter((k) => (qa.get(k) ?? []).join('\u0000') !== (qb.get(k) ?? []).join('\u0000'))
    .sort();
  if (changed.length > 0) out.push(`URL query changed (parameters: ${changed.join(', ')})`);
  if (a.hash !== b.hash) out.push('URL fragment changed');
  return out;
}

/** What visibly changed between two observations of the page; `[]` when nothing did. */
export function stepOutcomes(before: StepSide, after: StepSide): string[] {
  const out: string[] = [];
  if (before.title != null && after.title != null && before.title !== after.title)
    out.push(`Title changed from "${before.title}" to "${after.title}"`);
  out.push(...urlOutcomes(before.url, after.url));

  const nb = parse(before.snapshot);
  const na = parse(after.snapshot);

  const dialogs = (nodes: readonly Node[]): string[] =>
    nodes.filter((n) => n.role === 'dialog' || n.role === 'alertdialog').map((n) => label(n));
  for (const d of added(dialogs(nb), dialogs(na)))
    out.push(d ? `Dialog appeared: "${d}"` : 'Dialog appeared');

  const ab = alertsOf(nb);
  const aa = alertsOf(na);
  for (const s of added(
    ab.map((x) => x.summary),
    aa.map((x) => x.summary),
  ))
    out.push(s ? `Alert appeared: "${s}"` : 'Alert appeared');
  for (const m of added(
    ab.flatMap((x) => x.messages),
    aa.flatMap((x) => x.messages),
  ))
    out.push(`Validation message: "${m}"`);

  const cb = counts(nb);
  const ca = counts(na);
  for (const role of COUNTED) {
    const x = cb.get(role) ?? 0;
    const y = ca.get(role) ?? 0;
    if (x !== y) out.push(`${role} count changed from ${x} to ${y}`);
  }
  return out;
}
