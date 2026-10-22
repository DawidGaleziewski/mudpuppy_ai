/** Pictures of the states the export cites (spec 008 US4): screenshot, wireframes, layout boxes. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Layout, isEvidenceRef } from '@mudpuppy/core';
import type { RawDb } from '../keys.js';
import { withLabel } from './label-box.js';
import type { ExportEvidence, ExportRecord, ExportRegion, ExportScreen } from './model.js';

type ScreenEntry = { screen: ExportScreen; boxes: Map<string, ExportRegion['box']> } | null;

/** The store, the evidence folder and the pictures read so far (one read per state). */
export interface Pictures {
  raw: RawDb;
  evidenceRoot: string | undefined;
  screenCache: Map<string, ScreenEntry>;
}

/** A state's layout boxes by element key, read from the evidence store; empty when unreadable. */
function layoutBoxes(evidenceRoot: string | undefined, layoutRef: string | null) {
  const out = new Map<string, ExportRegion['box']>();
  let page: ExportScreen['page'] = null;
  if (!evidenceRoot || !layoutRef || !isEvidenceRef(layoutRef)) return { page, boxes: out };
  try {
    const layout = Layout.parse(JSON.parse(readFileSync(join(evidenceRoot, layoutRef), 'utf8')));
    page = layout.page;
    for (const e of layout.elements)
      out.set(e.key, withLabel(e.box, e.role, e.name, layout.page.width));
  } catch {
    // an unreadable layout only means no boxes
  }
  return { page, boxes: out };
}

/** A cited state's picture and layout boxes (spec 008 US4), read once per state. */
function screenOf(ctx: Pictures, stateId: string): ScreenEntry {
  if (ctx.screenCache.has(stateId)) return ctx.screenCache.get(stateId)!;
  const row = ctx.raw
    .prepare(
      `SELECT s.title, s.route_template, s.screenshot_ref, s.layout_ref,
              w.svg_ref, w.excalidraw_ref
       FROM states s LEFT JOIN state_wireframes w ON w.state_id = s.id WHERE s.id = ?`,
    )
    .get(stateId) as
    | {
        title: string;
        route_template: string;
        screenshot_ref: string | null;
        layout_ref: string | null;
        svg_ref: string | null;
        excalidraw_ref: string | null;
      }
    | undefined;
  // A picture is exported only when its file is there, so no image link can dangle.
  const root = ctx.evidenceRoot;
  const present = (ref: string | null): string | null =>
    ref && root && isEvidenceRef(ref) && existsSync(join(root, ref)) ? ref : null;
  let value: ScreenEntry = null;
  if (row) {
    const { page, boxes } = layoutBoxes(root, row.layout_ref);
    value = {
      screen: {
        state_id: stateId,
        title: row.title,
        route_template: row.route_template,
        screenshot_ref: present(row.screenshot_ref),
        wireframe_svg_ref: present(row.svg_ref),
        wireframe_excalidraw_ref: present(row.excalidraw_ref),
        page,
      },
      boxes,
    };
  }
  ctx.screenCache.set(stateId, value);
  return value;
}

/** Pictures of the cited states: one entry per state, in link order. */
export function visualsOf(
  ctx: Pictures,
  evidence: readonly ExportEvidence[],
): ExportRecord['visuals'] {
  const screens: ExportScreen[] = [];
  const regions: ExportRegion[] = [];
  for (const e of evidence) {
    if (e.target_kind !== 'state' && e.target_kind !== 'screen_region') continue;
    const s = screenOf(ctx, e.target_id);
    if (!s) continue;
    if (!screens.some((x) => x.state_id === e.target_id)) screens.push(s.screen);
    if (e.target_kind === 'screen_region' && e.region)
      regions.push({
        state_id: e.target_id,
        key: e.region,
        note: e.note,
        box: s.boxes.get(e.region) ?? null,
      });
  }
  return { screens, regions };
}
