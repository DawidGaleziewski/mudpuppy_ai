// Annotated screenshots of a process export (owner review 2026-10-17, points b and c): the state's
// screenshot with tagged boxes on its elements, or with each field's validation message drawn in a
// box under it (a native message is the browser's bubble, which no screenshot holds). The
// validation picture cuts the screenshot under each field and opens a band for the message, as a
// page's own error line would push the rest down, so a message never covers the next field. SVG
// with the PNG inside as a data URI: an SVG shown as an image may not load a file next to it.

import type { Box } from '@mudpuppy/core';
import type { PictureMark } from './elements.js';
import type { ValidationRow } from './validation.js';

const TONE = { field: '#1d4ed8', action: '#b45309', error: '#dc2626' } as const;

const FONT = 'font-family="Arial, Helvetica, sans-serif"';
/** Average glyph width of the 13 px note text, rounded up so a box rather overshoots than cuts. */
const NOTE_CHAR_PX = 7.5;
const NOTE_LINE_PX = 18;
/** Notes whose cuts lie this close share one band (fields side by side). */
const SAME_ROW_PX = 6;

type Page = { width: number; height: number };

export interface Note {
  box: Box;
  tag: string;
  text: string;
  radio: boolean;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const badgeWidth = (tag: string): number => 10 + tag.length * 8;

/** No other box lies in the `w` pixels left of `box` on its row. */
function leftFree(box: Box, w: number, others: readonly Box[]): boolean {
  const from = box.x - 4 - w;
  return (
    from >= 0 &&
    !others.some(
      (o) =>
        o !== box &&
        o.x < box.x &&
        o.x + o.width > from &&
        o.y < box.y + box.height &&
        o.y + o.height > box.y,
    )
  );
}

/** A tag on the box: left of it when that space is free (stacked links), else on its top edge. */
function badge(
  box: Box,
  tag: string,
  fill: string,
  left: boolean,
  others: readonly Box[] = [],
): string {
  const w = badgeWidth(tag);
  const room = leftFree(box, w, others);
  const x = left && room ? box.x - 4 - w : box.x - 2;
  const top = left && room ? box.y + box.height / 2 - 9 : Math.max(0, box.y - 20);
  return `<rect x="${x}" y="${top}" width="${w}" height="18" rx="3" fill="${fill}"/><text x="${x + w / 2}" y="${top + 13}" ${FONT} font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">${esc(tag)}</text>`;
}

function outline(box: Box, line: string): string {
  return `<rect x="${box.x - 2}" y="${box.y - 2}" width="${box.width + 4}" height="${box.height + 4}" fill="none" stroke="${line}" stroke-width="2"/>`;
}

/** Words wrapped to lines of at most `chars` characters (a longer word stands alone). */
function wrap(text: string, chars: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && last.length + 1 + word.length <= chars)
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

function svg(page: Page, height: number, title: string, defs: string, body: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}" height="${height}" viewBox="0 0 ${page.width} ${height}">`,
    `<title>${esc(title)}</title>`,
    `<defs>${defs}</defs>`,
    `<rect width="${page.width}" height="${height}" fill="#ffffff"/>`,
    body,
    '</svg>',
    '',
  ].join('\n');
}

const shot = (png: Uint8Array, page: Page): string =>
  `<image id="shot" href="data:image/png;base64,${Buffer.from(png).toString('base64')}" x="0" y="0" width="${page.width}" height="${page.height}"/>`;

/** The screenshot with every element boxed and tagged (fields blue numbers, actions amber letters). */
export function elementsSvg(
  png: Uint8Array,
  page: Page,
  marks: readonly PictureMark[],
  title: string,
): string {
  const boxes = marks.map((m) => m.box);
  const body = [
    '<use href="#shot"/>',
    ...marks.map(
      (m) =>
        outline(m.box, TONE[m.kind]) +
        badge(m.box, m.tag, TONE[m.kind], m.kind === 'action', boxes),
    ),
  ].join('\n');
  return svg(page, page.height, title, shot(png, page), body);
}

interface Placed {
  note: Note;
  width: number;
  lines: string[];
}

interface Band {
  cut: number;
  height: number;
  notes: Placed[];
}

/** The bands opened under the fields, top to bottom; notes of fields side by side share one. */
function bandsOf(notes: readonly Note[], page: Page): Band[] {
  const bands: Band[] = [];
  const sorted = [...notes].sort((a, b) => a.box.y + a.box.height - (b.box.y + b.box.height));
  for (const note of sorted) {
    const width = Math.min(page.width - note.box.x, Math.max(note.box.width, 260));
    const lines = wrap(note.text, Math.max(10, Math.floor((width - 16) / NOTE_CHAR_PX)));
    const cut = Math.min(page.height, note.box.y + note.box.height + 3);
    const height = lines.length * NOTE_LINE_PX + 14;
    const last = bands[bands.length - 1];
    if (last !== undefined && cut - last.cut <= SAME_ROW_PX) {
      last.height = Math.max(last.height, height);
      last.notes.push({ note, width, lines });
    } else bands.push({ cut, height, notes: [{ note, width, lines }] });
  }
  return bands;
}

function noteSvg(p: Placed, top: number): string {
  const { box } = p.note;
  const height = p.lines.length * NOTE_LINE_PX + 8;
  const text = p.lines
    .map(
      (l, i) =>
        `<text x="${box.x + 8}" y="${top + 17 + i * NOTE_LINE_PX}" ${FONT} font-size="13" fill="#7f1d1d">${esc(l)}</text>`,
    )
    .join('');
  return `<rect x="${box.x}" y="${top}" width="${p.width}" height="${height}" rx="4" fill="#fef2f2" stroke="${TONE.error}" stroke-width="1.5"/>${text}`;
}

/** The screenshot cut under each messaged field, the message in a red box in the band opened there. */
export function validationSvg(
  png: Uint8Array,
  page: Page,
  notes: readonly Note[],
  title: string,
): string {
  const bands = bandsOf(notes, page);
  /** How far a point of the screenshot moves down: the bands opened above it. */
  const shift = (y: number): number =>
    bands.filter((b) => b.cut <= y).reduce((n, b) => n + b.height, 0);
  const edges = [0, ...bands.map((b) => b.cut), page.height];
  const defs = [shot(png, page)];
  const body: string[] = [];
  edges.slice(0, -1).forEach((from, i) => {
    const to = edges[i + 1] ?? page.height;
    if (to <= from) return;
    defs.push(
      `<clipPath id="slice-${i}"><rect x="0" y="${from}" width="${page.width}" height="${to - from}"/></clipPath>`,
    );
    body.push(
      `<g transform="translate(0,${shift(from)})"><use href="#shot" clip-path="url(#slice-${i})"/></g>`,
    );
  });
  bands.forEach((b, i) => {
    const top = b.cut + bands.slice(0, i).reduce((n, x) => n + x.height, 0) + 3;
    for (const p of b.notes) {
      const box = { ...p.note.box, y: p.note.box.y + shift(p.note.box.y) };
      body.push(
        outline(box, TONE.error),
        badge(box, p.note.tag, TONE.error, false),
        noteSvg(p, top),
      );
    }
  });
  const height = page.height + bands.reduce((n, b) => n + b.height, 0);
  return svg(page, height, title, defs.join('\n'), body.join('\n'));
}

/** The probe a picture shows first per field: what a user meets most, an empty required field. */
const PICTURE_ORDER = ['required-empty-one', 'required-empty-all', 'wrong-format', 'boundary'];

const rank = (probe: string): number => {
  const i = PICTURE_ORDER.indexOf(probe);
  return i < 0 ? PICTURE_ORDER.length : i;
};

/** One message per field that has a box on the picture, the most common case first. */
export function validationNotes(
  rows: readonly ValidationRow[],
  marks: readonly PictureMark[],
): Note[] {
  const notes: Note[] = [];
  for (const m of marks) {
    if (m.kind !== 'field' || notes.some((n) => n.tag === m.tag)) continue;
    const said = rows
      .filter((r) => r.field === m.name && r.message !== null)
      .sort((a, b) => rank(a.probe) - rank(b.probe));
    const first = said[0];
    // A radio group's message shows once, on its first option, as the browser does.
    const groupSaid = m.role === 'radio' && notes.some((n) => n.radio && n.text === first?.message);
    if (first?.message && !groupSaid)
      notes.push({ box: m.box, tag: m.tag, text: first.message, radio: m.role === 'radio' });
  }
  return notes;
}
