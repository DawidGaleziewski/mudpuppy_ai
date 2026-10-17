// Every element of a step's page, tagged on its screenshot (owner review 2026-10-17, point c): the
// form fields carry their number from the fields table, the buttons and links a letter, and an
// action says where the recorded clicks led. Boxes come from the state's layout (spec 008), so a
// picture is only drawn for a state with both a screenshot and a layout.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Layout, type Box } from '@pathfinder/core';
import type { RawDb } from '../keys.js';
import { withLabel } from '../render/label-box.js';
import type { StepState } from './step-states.js';

const FIELD_ROLES: ReadonlySet<string> = new Set([
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'spinbutton',
  'slider',
  'radio',
  'checkbox',
  'switch',
]);
const ACTION_ROLES: ReadonlySet<string> = new Set(['button', 'link']);

export interface PageElement {
  /** `3` for the third field of the fields table, `B` for the second button or link. */
  tag: string;
  kind: 'field' | 'action';
  role: string;
  name: string;
  /** Where the recorded clicks on it led (routes), for an action. */
  leads_to: string[];
}

export interface PictureMark {
  tag: string;
  kind: 'field' | 'action';
  role: string;
  name: string;
  box: Box;
}

export interface StatePicture {
  /** The state's position in the step's states (its image is `step-N-<i+1>-…`). */
  index: number;
  page: { width: number; height: number };
  marks: PictureMark[];
}

export interface StepElements {
  elements: PageElement[];
  pictures: StatePicture[];
}

function readLayout(root: string, ref: string): Layout | null {
  try {
    return Layout.parse(JSON.parse(readFileSync(join(root, ref), 'utf8')));
  } catch {
    return null; // an unreadable layout only means no picture
  }
}

function kindOf(role: string): PageElement['kind'] | null {
  if (FIELD_ROLES.has(role)) return 'field';
  return ACTION_ROLES.has(role) ? 'action' : null;
}

/** A, B, … Z, AA, AB… */
const letter = (i: number): string =>
  i < 26 ? String.fromCharCode(65 + i) : letter(Math.floor(i / 26) - 1) + letter(i % 26);

function leadsTo(raw: RawDb, ids: readonly string[], name: string): string[] {
  return (
    raw
      .prepare(
        `SELECT DISTINCT t.route_template AS route FROM edges e JOIN states t ON t.id = e.to_state
         WHERE e.from_state IN (${ids.map(() => '?').join(',')}) AND e.status = 'executed'
           AND json_extract(e.action_json, '$.accessible_name') = ? ORDER BY route`,
      )
      .all(...ids, name) as { route: string }[]
  ).map((r) => r.route);
}

/**
 * The elements on the step's happy-path states, tagged once for the whole step (the same element
 * has the same tag on every picture), and one picture per happy-path state with a layout.
 */
export function elementsOfStep(
  raw: RawDb,
  evidenceRoot: string | undefined,
  states: readonly StepState[],
  fieldLabels: readonly string[],
): StepElements {
  const elements = new Map<string, PageElement>();
  const pictures: StatePicture[] = [];
  let actions = 0;
  let extraFields = fieldLabels.length;
  states.forEach((s, index) => {
    const layout =
      s.kind === 'main' && evidenceRoot && s.layout_ref && s.screenshot_ref
        ? readLayout(evidenceRoot, s.layout_ref)
        : null;
    if (layout === null) return;
    const marks: PictureMark[] = [];
    for (const e of layout.elements) {
      const kind = kindOf(e.role);
      const box = withLabel(e.box, e.role, e.name, layout.page.width);
      if (kind === null || box === null) continue;
      const key = `${kind}|${e.role}|${e.name}`;
      let el = elements.get(key);
      if (el === undefined) {
        // A field the fields table lacks (not in a recorded form) is numbered after its rows.
        const n = fieldLabels.indexOf(e.name) + 1;
        const fieldTag = () => String(n > 0 ? n : ++extraFields);
        const tag = kind === 'action' ? letter(actions++) : fieldTag();
        el = {
          tag,
          kind,
          role: e.role,
          name: e.name,
          leads_to: kind === 'action' ? leadsTo(raw, s.state_ids, e.name) : [],
        };
        elements.set(key, el);
      }
      marks.push({ tag: el.tag, kind, role: e.role, name: e.name, box });
    }
    pictures.push({ index, page: layout.page, marks });
  });
  return { elements: [...elements.values()], pictures };
}
