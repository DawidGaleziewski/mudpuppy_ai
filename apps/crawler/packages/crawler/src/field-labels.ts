import type { CandidateAction } from './action-extractor.js';
import type { DomForm, DomFormField } from './forms.js';

// Unnamed controls get the label a person sees (spec 038, LO-48). Legacy and React forms often put
// the text in a `<label>` that is not tied to its control, so ARIA names the control nothing
// (`combobox`, `textbox`) and neither the agent nor a reader can tell the city from the postcode.
// The DOM form reader already found that text (label element, aria, placeholder or nearby text);
// here each unnamed input candidate is matched to its DOM field by document order.

type Kind = 'text' | 'select';

/** The ARIA roles of input candidates matched here, and the DOM field types they stand for. */
const ROLE_KIND: Readonly<Record<string, Kind>> = {
  textbox: 'text',
  searchbox: 'text',
  spinbutton: 'text',
  combobox: 'select',
};
const NOT_TEXT = new Set([
  'select',
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'hidden',
  'image',
  'file',
]);

function fieldKind(f: DomFormField): Kind | null {
  if (f.type === 'select') return 'select';
  return NOT_TEXT.has(f.type) ? null : 'text';
}

const inForm = (c: CandidateAction): boolean =>
  c.ancestors.some((a) => a === 'form' || a.startsWith('form '));

/**
 * Pair candidates and fields of one kind in order; only when both lists are the same length, so a
 * control the ARIA tree or the form reader left out never shifts every label after it.
 */
function pair(cands: CandidateAction[], fields: DomFormField[]): void {
  for (const kind of ['text', 'select'] as const) {
    const cs = cands.filter((c) => ROLE_KIND[c.role] === kind);
    const fs = fields.filter((f) => fieldKind(f) === kind);
    if (cs.length === 0 || cs.length !== fs.length) continue;
    cs.forEach((c, i) => {
      const label = fs[i]!.label;
      if (c.name === null && label) c.label = label;
    });
  }
}

/**
 * Give each unnamed input candidate the visible label of its DOM field (`label`). Controls inside a
 * `<form>` are matched with the real forms' fields; controls outside any form with the `div_form`
 * fields, which the reader lists after the real forms (spec 015 FR-008).
 */
export function withFieldLabels(
  cands: CandidateAction[],
  forms: readonly DomForm[],
): CandidateAction[] {
  const inputs = cands.filter((c) => c.input !== undefined && ROLE_KIND[c.role] !== undefined);
  if (!inputs.some((c) => c.name === null)) return cands;
  const fieldsOf = (div: boolean) =>
    forms.filter((f) => (f.kind === 'div_form') === div).flatMap((f) => f.fields);
  pair(inputs.filter(inForm), fieldsOf(false));
  pair(
    inputs.filter((c) => !inForm(c)),
    fieldsOf(true),
  );
  return cands;
}
