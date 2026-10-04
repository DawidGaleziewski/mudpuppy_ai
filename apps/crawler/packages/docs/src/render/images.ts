import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import type { ExportModel, ExportRecord, ExportRegion, ExportScreen } from './model.js';

/**
 * Images of the SRS export (spec 008 contracts/srs-export-delta.md): screenshot copies, wireframes
 * and highlight crops. Paths are a pure function of the model; bytes depend only on the stored
 * evidence, so two exports of the same store give identical files.
 */

export const HIGHLIGHT_PADDING = 120;
const OUTLINE = [0xe8, 0x59, 0x0c] as const; // #E8590C
const OUTLINE_WIDTH = 3;
const PNG_OPTIONS = { deflateLevel: 9, filterType: 4 } as const;

export interface ScreenFiles {
  screen: ExportScreen;
  screenshot: string | null;
  wireframe_svg: string | null;
  wireframe_excalidraw: string | null;
}

/** A screen record's own pictures: its first cited state. Null for other kinds or no state. */
export function screenFiles(r: ExportRecord): ScreenFiles | null {
  const screen = r.visuals.screens[0];
  if (r.kind !== 'screen' || !screen) return null;
  return {
    screen,
    screenshot: screen.screenshot_ref ? `images/screens/${r.key}.png` : null,
    wireframe_svg: screen.wireframe_svg_ref ? `images/wireframes/${r.key}.svg` : null,
    wireframe_excalidraw: screen.wireframe_excalidraw_ref
      ? `images/wireframes/${r.key}.excalidraw`
      : null,
  };
}

export interface HighlightFile {
  screen: ExportScreen;
  /** Null when no region of this state can be drawn (no screenshot or no boxes). */
  path: string | null;
  /** Regions of this state, numbered from 1 in the order they are cited. */
  regions: (ExportRegion & { n: number })[];
}

/** One entry per cited state that has regions; a picture only where a region has a box. */
export function highlightFiles(r: ExportRecord): HighlightFile[] {
  let n = 0;
  return r.visuals.screens
    .map((screen) => ({
      screen,
      regions: r.visuals.regions
        .filter((g) => g.state_id === screen.state_id)
        .map((g, i) => ({ ...g, n: i + 1 })),
    }))
    .filter((h) => h.regions.length > 0)
    .map((h) => {
      const drawable = h.screen.screenshot_ref !== null && h.regions.some((g) => g.box !== null);
      return { ...h, path: drawable ? `images/highlights/${r.key}-${++n}.png` : null };
    });
}

/** 5×7 bitmaps of the digits, one string of 7 rows per digit (`#` = set). */
const DIGITS: Record<string, string[]> = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
};
const SCALE = 2;

function setPixel(png: PNG, x: number, y: number, rgb: readonly number[]): void {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (y * png.width + x) * 4;
  png.data[i] = rgb[0]!;
  png.data[i + 1] = rgb[1]!;
  png.data[i + 2] = rgb[2]!;
  png.data[i + 3] = 255;
}

function fill(png: PNG, x: number, y: number, w: number, h: number, rgb: readonly number[]): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setPixel(png, xx, yy, rgb);
}

/** A numbered badge: orange box with white digits, top-left at (x, y). */
function badge(png: PNG, x: number, y: number, n: number): void {
  const digits = String(n);
  const w = 4 + digits.length * 6 * SCALE;
  const h = 4 + 7 * SCALE;
  fill(png, x, y, w, h, OUTLINE);
  [...digits].forEach((d, i) => {
    DIGITS[d]!.forEach((row, ry) => {
      [...row].forEach((c, rx) => {
        if (c === '#')
          fill(
            png,
            x + 2 + i * 6 * SCALE + rx * SCALE,
            y + 2 + ry * SCALE,
            SCALE,
            SCALE,
            [255, 255, 255],
          );
      });
    });
  });
}

/**
 * Crop `png` to the union of the boxed regions plus padding (clamped to the image), outline each
 * region and number it. Pure: the same image and regions give the same bytes.
 */
export function highlightCrop(
  png: Uint8Array,
  regions: readonly (ExportRegion & { n: number })[],
  padding = HIGHLIGHT_PADDING,
): Uint8Array {
  const src = PNG.sync.read(Buffer.from(png));
  const boxed = regions.filter(
    (g): g is typeof g & { box: NonNullable<ExportRegion['box']> } => g.box !== null,
  );
  if (boxed.length === 0) throw new Error('highlightCrop: no region has a box');
  const x0 = Math.max(0, Math.min(...boxed.map((g) => g.box.x)) - padding);
  const y0 = Math.max(0, Math.min(...boxed.map((g) => g.box.y)) - padding);
  const x1 = Math.min(src.width, Math.max(...boxed.map((g) => g.box.x + g.box.width)) + padding);
  const y1 = Math.min(src.height, Math.max(...boxed.map((g) => g.box.y + g.box.height)) + padding);
  const out = new PNG({ width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) });
  PNG.bitblt(src, out, x0, y0, out.width, out.height, 0, 0);
  for (const g of boxed) {
    const bx = g.box.x - x0;
    const by = g.box.y - y0;
    const t = OUTLINE_WIDTH;
    fill(out, bx - t, by - t, g.box.width + 2 * t, t, OUTLINE);
    fill(out, bx - t, by + g.box.height, g.box.width + 2 * t, t, OUTLINE);
    fill(out, bx - t, by, t, g.box.height, OUTLINE);
    fill(out, bx + g.box.width, by, t, g.box.height, OUTLINE);
  }
  for (const g of boxed) {
    const by = g.box.y - y0;
    badge(
      out,
      Math.max(0, g.box.x - x0 - OUTLINE_WIDTH),
      Math.max(0, by - OUTLINE_WIDTH - 18),
      g.n,
    );
  }
  return new Uint8Array(PNG.sync.write(out, PNG_OPTIONS));
}

/**
 * Every image file of the export, read from the evidence store, by path. Missing evidence files
 * are skipped (the chapters still name what is missing).
 */
export function imageFiles(m: ExportModel, evidenceRoot: string): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const read = (ref: string): Uint8Array | null => {
    try {
      return new Uint8Array(readFileSync(join(evidenceRoot, ref)));
    } catch {
      return null;
    }
  };
  for (const r of m.records) {
    const s = screenFiles(r);
    if (s) {
      const pairs: [string | null, string | null][] = [
        [s.screenshot, s.screen.screenshot_ref],
        [s.wireframe_svg, s.screen.wireframe_svg_ref],
        [s.wireframe_excalidraw, s.screen.wireframe_excalidraw_ref],
      ];
      for (const [path, ref] of pairs) {
        const bytes = path && ref ? read(ref) : null;
        if (path && bytes) files.set(path, bytes);
      }
    }
    for (const h of highlightFiles(r)) {
      if (!h.path || !h.screen.screenshot_ref) continue;
      const png = read(h.screen.screenshot_ref);
      if (png) files.set(h.path, highlightCrop(png, h.regions));
    }
  }
  return files;
}
