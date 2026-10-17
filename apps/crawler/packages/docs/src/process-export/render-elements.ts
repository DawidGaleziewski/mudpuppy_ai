// The "Elements on the page" and "Validation" sections of a step in PROCESS_STEPS.md (owner review
// 2026-10-17, points b and c), and the paths of their pictures. Pure functions of the model.

import { cell, inline, table } from '../render/format.js';
import type { StepModel } from './model.js';
import { validationNotes } from './pictures.js';

export const elementsImage = (n: number, index: number): string =>
  `images/step-${n}-${index + 1}-elements.svg`;

/** The validation picture is drawn on the step's first happy-path picture, when a message fits it. */
export function validationImage(sm: StepModel): string | null {
  const first = sm.pictures[0];
  if (first === undefined) return null;
  return validationNotes(sm.validation, first.marks).length > 0
    ? `images/step-${sm.step.n}-validation.svg`
    : null;
}

const pictureName = (sm: StepModel, index: number): string => {
  const v = sm.step.states[index]?.variant;
  return v ? `${sm.step.n}${v}` : `step ${sm.step.n}`;
};

export function elementsSection(sm: StepModel): string[] {
  if (sm.pictures.length === 0) return ['_No layout recorded: the elements cannot be marked._'];
  return [
    'Fields carry their number from the table above, buttons and links a letter.',
    '',
    ...sm.pictures.flatMap((p) => [
      `![Elements of ${pictureName(sm, p.index)}](${elementsImage(sm.step.n, p.index)})`,
      '',
    ]),
    ...table(
      ['Tag', 'Element', 'Role', 'Leads to'],
      sm.elements.map((e) => [
        `**${e.tag}**`,
        cell(e.name) || '_(no name)_',
        e.role,
        e.kind === 'action' ? e.leads_to.map((r) => `\`${r}\``).join(', ') || '_not clicked_' : '—',
      ]),
    ),
  ];
}

function shownAs(r: StepModel['validation'][number]): string {
  if (r.source === 'native') return 'browser bubble';
  if (r.source === 'dom') return 'text on the page';
  return r.accepted ? '_accepted: the form went on_' : '_refused, no message recorded_';
}

export function validationSection(sm: StepModel): string[] {
  if (sm.validation.length === 0) return ['_No validation probe ran on this step._'];
  const pic = validationImage(sm);
  // In the order of the fields table; a form-level message and an unknown field last.
  const at = (f: string | null) => {
    const i = sm.fields.findIndex((x) => x.label === f);
    return i < 0 ? sm.fields.length : i;
  };
  const rows = [...sm.validation].sort((a, b) => at(a.field) - at(b.field));
  return [
    'What the form says to wrong input, from the validation probes. A browser bubble is the',
    "browser's own message (in the browser's language): it shows one at a time, on the first wrong",
    'field; the picture draws each field’s first message at once, in a box under the field.',
    '',
    ...(pic ? [`![Validation messages of step ${sm.step.n}](${pic})`, ''] : []),
    ...table(
      ['Field', 'Tried', 'Message (exact)', 'Shown as'],
      rows.map((r) => [
        r.field === null ? '_the form_' : cell(r.field),
        inline(r.tried),
        r.message === null ? '—' : `“${inline(r.message)}”`,
        shownAs(r),
      ]),
    ),
  ];
}
