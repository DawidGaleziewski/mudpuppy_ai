import type { ExportRegion } from './model.js';

/**
 * A radio's or checkbox's layout box is the input alone, while its visible label is a separate
 * element (its text is the control's accessible name). A highlight of the bare box cuts the label
 * off (spec 008 F-12), so the box is widened to the right by the label's estimated width.
 */
const LABELLED_CONTROLS: ReadonlySet<string> = new Set(['radio', 'checkbox', 'switch']);

/** Generous average glyph width at body size, so the estimate rather overshoots than cuts. */
const CHAR_PX = 9;
/** Space between the control and its label. */
const GAP_PX = 8;

type Box = NonNullable<ExportRegion['box']>;

export function withLabel(box: Box | null, role: string, name: string, pageWidth: number) {
  if (!box || !LABELLED_CONTROLS.has(role) || name.trim() === '') return box;
  // A wide box (a styled card) already holds its label.
  if (box.width > 2 * box.height) return box;
  const right = Math.min(pageWidth, box.x + box.width + GAP_PX + name.length * CHAR_PX);
  return { ...box, width: Math.max(box.width, right - box.x) };
}
