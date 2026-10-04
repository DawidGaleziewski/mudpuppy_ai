import { parseAriaYaml, walkKeyed, type AriaNode } from '@pathfinder/core';

/**
 * Wireframe layout (spec 008 contracts/wireframe-format.md): a recorded ARIA snapshot turned into
 * positioned primitives in a single-column flow. Pure and deterministic: the same snapshot always
 * gives the same primitives, with integer coordinates. Nothing is drawn that is not in the snapshot.
 */

export type Tone = 'ink' | 'muted' | 'line' | 'fill' | 'frame' | 'paper';

interface PrimBase {
  /** Element key of the snapshot node this draws, or a synthetic one (`text#3`) for plain text. */
  key: string;
  /** What part of the node this is (`box`, `label`, `cross-1`, `cell-2-3`, ...); unique per key. */
  part: string;
}
export interface RectPrim extends PrimBase {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  stroke: Tone;
  fill: Tone | null;
  rounded: boolean;
  dashed: boolean;
}
export interface EllipsePrim extends PrimBase {
  kind: 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
  stroke: Tone;
}
export interface LinePrim extends PrimBase {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: Tone;
}
export interface TextPrim extends PrimBase {
  kind: 'text';
  /** Left edge (or centre when `anchor` is `middle`) and baseline-free top of the text box. */
  x: number;
  y: number;
  text: string;
  size: number;
  bold: boolean;
  tone: Tone;
  anchor: 'start' | 'middle';
}
export type Prim = RectPrim | EllipsePrim | LinePrim | TextPrim;

export interface WireframeModel {
  title: string;
  width: number;
  height: number;
  prims: Prim[];
}

export const MARGIN = 24;
export const GAP = 12;
export const INDENT = 16;
export const MAX_NODES = 120;
export const MAX_LABEL = 60;
const TABLE_MAX = 4;
const LIST_MAX = 8;
const BAR_CHARS = 80;
const BAR_MAX = 3;

const FRAMES = new Set([
  'banner',
  'navigation',
  'main',
  'contentinfo',
  'complementary',
  'region',
  'search',
  'form',
  'dialog',
  'alert',
]);
const INPUTS = new Set(['textbox', 'searchbox', 'spinbutton', 'combobox', 'listbox']);
const CHOICES = new Set(['checkbox', 'radio', 'switch']);
const TEXTUAL = new Set(['paragraph', 'text', 'strong', 'emphasis', 'code', 'status', 'note']);
const HEADING_SIZE = [28, 22, 18, 16];

export function cut(text: string, max = MAX_LABEL): string {
  // Icon-font glyphs (Unicode private use area) carry no text and draw as empty boxes.
  const t = text.replace(/[-]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** The visible text of a node: its name, else its inline text, else its descendants' names. */
function textOf(n: AriaNode): string {
  if (n.name) return n.name;
  if (n.text) return n.text;
  return n.children.map(textOf).filter(Boolean).join(' ');
}

/** `row` nodes of a table, wherever they sit (`rowgroup` or directly). */
function rowsOf(n: AriaNode): AriaNode[] {
  return n.children.flatMap((c) => (c.role === 'row' ? [c] : rowsOf(c)));
}

/** Build the wireframe layout of a recorded ARIA YAML snapshot. */
export function layoutWireframe(
  ariaYaml: string,
  opts: { title?: string; width?: number } = {},
): WireframeModel {
  const width = opts.width ?? 960;
  const tree = parseAriaYaml(ariaYaml);
  const keys = new Map<AriaNode, string>();
  walkKeyed(tree, (n, el) => keys.set(n, el.key));

  const prims: Prim[] = [];
  let y = MARGIN;
  let drawn = 0;
  let omitted = 0;
  let textSeq = 0;

  const keyOf = (n: AriaNode): string => keys.get(n) ?? `${n.role}#t${++textSeq}`;
  /** Reserve a node slot; false once the cap is reached (the node is counted as omitted). */
  const slot = (): boolean => {
    if (drawn >= MAX_NODES) {
      omitted += 1;
      return false;
    }
    drawn += 1;
    return true;
  };
  const text = (
    key: string,
    part: string,
    x: number,
    top: number,
    s: string,
    size: number,
    tone: Tone = 'ink',
    bold = false,
    anchor: 'start' | 'middle' = 'start',
  ): void => {
    prims.push({ kind: 'text', key, part, x, y: top, text: s, size, bold, tone, anchor });
  };

  const draw = (n: AriaNode, x: number, w: number): void => {
    const role = n.role;
    if (role === 'option') return; // drawn as part of their combobox / listbox
    if (FRAMES.has(role)) return frame(n, x, w);
    if (role === 'heading') {
      if (!slot()) return;
      const level = Math.min(Math.max(Number(n.attrs.level ?? 2), 1), 4);
      const size = HEADING_SIZE[level - 1]!;
      text(keyOf(n), 'label', x, y, cut(textOf(n)), size, 'ink', true);
      y += Math.round(size * 1.4) + GAP;
      return;
    }
    if (INPUTS.has(role)) {
      if (!slot()) return;
      const k = keyOf(n);
      text(k, 'label', x, y, cut(n.name ?? ''), 13, 'muted');
      const bw = Math.min(w, 360);
      prims.push({
        kind: 'rect',
        key: k,
        part: 'box',
        x,
        y: y + 18,
        w: bw,
        h: 34,
        stroke: 'line',
        fill: 'paper',
        rounded: false,
        dashed: false,
      });
      if (role === 'combobox' || role === 'listbox')
        text(k, 'chevron', x + bw - 20, y + 26, '▾', 14, 'muted');
      else if (n.text) text(k, 'value', x + 8, y + 27, cut(n.text, 40), 13, 'muted');
      y += 56 + GAP;
      return;
    }
    if (CHOICES.has(role)) {
      if (!slot()) return;
      const k = keyOf(n);
      if (role === 'radio')
        prims.push({
          kind: 'ellipse',
          key: k,
          part: 'box',
          x,
          y: y + 4,
          w: 14,
          h: 14,
          stroke: 'line',
        });
      else
        prims.push({
          kind: 'rect',
          key: k,
          part: 'box',
          x,
          y: y + 4,
          w: role === 'switch' ? 26 : 14,
          h: 14,
          stroke: 'line',
          fill: n.attrs.checked ? 'line' : 'paper',
          rounded: role === 'switch',
          dashed: false,
        });
      text(k, 'label', x + (role === 'switch' ? 34 : 22), y + 3, cut(n.name ?? ''), 13);
      y += 24 + GAP;
      return;
    }
    if (role === 'button') {
      if (!slot()) return;
      const k = keyOf(n);
      const label = cut(n.name || textOf(n)) || 'button';
      const bw = Math.min(w, Math.max(80, label.length * 8 + 32));
      prims.push({
        kind: 'rect',
        key: k,
        part: 'box',
        x,
        y,
        w: bw,
        h: 36,
        stroke: 'ink',
        fill: 'fill',
        rounded: true,
        dashed: false,
      });
      text(k, 'label', x + Math.round(bw / 2), y + 10, label, 14, 'ink', true, 'middle');
      y += 36 + GAP;
      return;
    }
    if (role === 'link') {
      if (!slot()) return;
      const k = keyOf(n);
      const label = cut(textOf(n)) || 'link';
      text(k, 'label', x, y, label, 14);
      const lw = Math.min(w, label.length * 8);
      prims.push({
        kind: 'line',
        key: k,
        part: 'underline',
        x1: x,
        y1: y + 18,
        x2: x + lw,
        y2: y + 18,
        stroke: 'ink',
      });
      y += 22 + GAP;
      return;
    }
    if (role === 'img') return image(n, x, w);
    if (role === 'table' || role === 'grid') return table(n, x, w);
    if (role === 'list') return list(n, x, w);
    if (TEXTUAL.has(role)) {
      const t = textOf(n);
      if (!t) return;
      if (!slot()) return;
      bars(keyOf(n), t, x, w);
      return;
    }
    if (n.text && n.children.length === 0 && !keys.has(n)) {
      if (!slot()) return;
      bars(keyOf(n), n.text, x, w);
      return;
    }
    drawAll(n.children, x, w);
  };

  /**
   * Draw siblings in order. A `text` node that only repeats a sibling control's name (the visible
   * `<label>` of a field the snapshot already names) is left out: the control draws its label.
   */
  function drawAll(nodes: readonly AriaNode[], x: number, w: number): void {
    const names = new Set(
      nodes.filter((s) => s.role !== 'text' && s.name).map((s) => cut(s.name!)),
    );
    for (const c of nodes) {
      if (c.role === 'text' && c.text !== undefined && names.has(cut(c.text))) continue;
      draw(c, x, w);
    }
  }

  function bars(k: string, t: string, x: number, w: number): void {
    const lines = Math.min(BAR_MAX, Math.max(1, Math.ceil(t.length / BAR_CHARS)));
    for (let i = 0; i < lines; i++) {
      const last = i === lines - 1;
      const share =
        last && t.length < BAR_CHARS * lines ? ((t.length - 1) % BAR_CHARS) + 1 : BAR_CHARS;
      const bw = Math.max(40, Math.round((w * share) / BAR_CHARS));
      prims.push({
        kind: 'rect',
        key: k,
        part: `bar-${i + 1}`,
        x,
        y,
        w: Math.min(bw, w),
        h: 10,
        stroke: 'frame',
        fill: 'frame',
        rounded: false,
        dashed: false,
      });
      y += 14;
    }
    y += GAP;
  }

  function frame(n: AriaNode, x: number, w: number): void {
    if (!slot()) {
      drawAll(n.children, x + INDENT, w - 2 * INDENT);
      return;
    }
    const k = keyOf(n);
    const top = y;
    text(k, 'label', x + 8, y + 4, cut(n.name ? `${n.role} · ${n.name}` : n.role), 11, 'muted');
    y += 24;
    const before = y;
    // `- contentinfo: Stopka`: a landmark holding only text shows it as text bars.
    if (n.text && n.children.length === 0) bars(`${k}`, n.text, x + INDENT, w - 2 * INDENT);
    drawAll(n.children, x + INDENT, w - 2 * INDENT);
    if (y === before) y += 8;
    prims.push({
      kind: 'rect',
      key: k,
      part: 'frame',
      x,
      y: top,
      w,
      h: y - top,
      stroke: 'frame',
      fill: null,
      rounded: false,
      dashed: n.role !== 'form' && n.role !== 'dialog',
    });
    y += GAP;
  }

  function image(n: AriaNode, x: number, w: number): void {
    if (!slot()) return;
    const k = keyOf(n);
    const iw = Math.min(w, 240);
    prims.push({
      kind: 'rect',
      key: k,
      part: 'box',
      x,
      y,
      w: iw,
      h: 96,
      stroke: 'line',
      fill: 'fill',
      rounded: false,
      dashed: false,
    });
    prims.push({
      kind: 'line',
      key: k,
      part: 'cross-1',
      x1: x,
      y1: y,
      x2: x + iw,
      y2: y + 96,
      stroke: 'line',
    });
    prims.push({
      kind: 'line',
      key: k,
      part: 'cross-2',
      x1: x + iw,
      y1: y,
      x2: x,
      y2: y + 96,
      stroke: 'line',
    });
    if (n.name)
      text(
        k,
        'label',
        x + Math.round(iw / 2),
        y + 40,
        cut(n.name, 30),
        12,
        'muted',
        false,
        'middle',
      );
    y += 96 + GAP;
  }

  function table(n: AriaNode, x: number, w: number): void {
    if (!slot()) return;
    const k = keyOf(n);
    const rows = rowsOf(n);
    const cells = rows.map((r) =>
      r.children.filter(
        (c) =>
          c.role === 'cell' ||
          c.role === 'columnheader' ||
          c.role === 'rowheader' ||
          c.role === 'gridcell',
      ),
    );
    const cols = Math.min(TABLE_MAX, Math.max(1, ...cells.map((c) => c.length)));
    const shown = Math.min(TABLE_MAX, Math.max(1, rows.length));
    const cw = Math.floor(Math.min(w, cols * 180) / cols);
    const top = y;
    for (let r = 0; r < shown; r++) {
      const header = cells[r]?.some((c) => c.role === 'columnheader') ?? false;
      for (let c = 0; c < cols; c++) {
        prims.push({
          kind: 'rect',
          key: k,
          part: `cell-${r + 1}-${c + 1}`,
          x: x + c * cw,
          y,
          w: cw,
          h: 32,
          stroke: 'line',
          fill: header ? 'fill' : 'paper',
          rounded: false,
          dashed: false,
        });
        const cell = cells[r]?.[c];
        if (cell)
          text(
            k,
            `text-${r + 1}-${c + 1}`,
            x + c * cw + 8,
            y + 9,
            cut(textOf(cell), 20),
            12,
            'ink',
            header,
          );
      }
      y += 32;
    }
    const more = rows.length - shown;
    if (more > 0) {
      text(k, 'more', x, y + 4, `+${more} more rows`, 11, 'muted');
      y += 20;
    }
    if (rows.length === 0) y = top + 32;
    y += GAP;
  }

  function list(n: AriaNode, x: number, w: number): void {
    if (!slot()) return;
    const k = keyOf(n);
    const items = n.children.filter((c) => c.role === 'listitem');
    const shown = items.slice(0, LIST_MAX);
    shown.forEach((item, i) => {
      prims.push({
        kind: 'ellipse',
        key: k,
        part: `bullet-${i + 1}`,
        x,
        y: y + 6,
        w: 6,
        h: 6,
        stroke: 'ink',
      });
      const link = item.children.find((c) => c.role === 'link');
      const label = cut(textOf(item), 50) || 'item';
      text(k, `item-${i + 1}`, x + 14, y, label, 13, 'ink');
      if (link)
        prims.push({
          kind: 'line',
          key: k,
          part: `underline-${i + 1}`,
          x1: x + 14,
          y1: y + 17,
          x2: x + 14 + Math.min(w - 14, label.length * 7),
          y2: y + 17,
          stroke: 'ink',
        });
      y += 22;
    });
    if (items.length > LIST_MAX) {
      text(k, 'more', x + 14, y, `+${items.length - LIST_MAX} more`, 11, 'muted');
      y += 20;
    }
    if (items.length === 0) y += 8;
    y += GAP;
  }

  const title = cut(opts.title ?? '', 100);
  if (title) {
    text('page', 'title', MARGIN, y, title, 12, 'muted');
    y += 24;
  }
  drawAll(tree, MARGIN, width - 2 * MARGIN);
  if (omitted > 0) {
    text('page', 'omitted', MARGIN, y, `+${omitted} more elements`, 12, 'muted');
    y += 24;
  }
  return { title, width, height: Math.max(y + MARGIN - GAP, 120), prims };
}
