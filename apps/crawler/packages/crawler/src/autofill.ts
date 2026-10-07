/// <reference lib="dom" />
import type { Locator } from 'playwright';
import { evalOnElement } from './pw-eval.js';
import { testValueFor, type AutofillField, type TestValue } from './test-values.js';

/**
 * Map-mode form autofill (spec 008 FR-002, research R9): before map mode presses a control that
 * submits a form, the form's empty fields are filled with test data, so the crawl reaches the page
 * behind the form instead of the browser's validation message. On production too since
 * constitution 4.0.0 (spec 011 FR-010), within the portal's limit.
 */

/** `field` (not `name`): the decision log redacts values under a `name` key as personal data. */
export interface AutofillResult {
  filled: { field: string; type: string; value: string }[];
  skipped: { field: string; reason: string }[];
}

/** The submit control's form fields, or null when the control does not submit a form. */
function readForm(el: Element): AutofillField[] | null {
  const control = el as HTMLButtonElement | HTMLInputElement;
  const form = (control as HTMLButtonElement).form;
  const tag = control.tagName.toLowerCase();
  const type = (control.getAttribute('type') || (tag === 'button' ? 'submit' : '')).toLowerCase();
  const submits =
    form !== null &&
    form !== undefined &&
    ((tag === 'button' && type === 'submit') ||
      (tag === 'input' && (type === 'submit' || type === 'image')));
  if (!submits || !form) return null;
  const skip = ['hidden', 'submit', 'button', 'image', 'reset'];
  const out: AutofillField[] = [];
  const checkedGroups = new Set<string>();
  for (const f of Array.from(form.elements)) {
    const input = f as HTMLInputElement;
    if (input.type === 'radio' && input.checked) checkedGroups.add(input.name);
  }
  Array.from(form.elements).forEach((f, index) => {
    const field = f as HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement;
    const ftag = field.tagName.toLowerCase();
    if (ftag !== 'input' && ftag !== 'select' && ftag !== 'textarea') return;
    const ftype = ftag === 'input' ? (field.type || 'text').toLowerCase() : ftag;
    if (skip.includes(ftype) || field.disabled || field.readOnly) return;
    const labelEl = field.labels && field.labels[0];
    const label = (
      (labelEl && labelEl.textContent) ||
      field.getAttribute('aria-label') ||
      field.getAttribute('placeholder') ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim();
    const isChoice = ftype === 'checkbox' || ftype === 'radio';
    const entry: AutofillField = {
      index,
      tag: ftag as AutofillField['tag'],
      type: ftype,
      name: field.name || field.id || label,
      label,
      required: field.required,
      empty:
        ftype === 'radio'
          ? !checkedGroups.has(field.name)
          : isChoice
            ? !field.checked
            : field.value === '',
    };
    if (ftype === 'radio' && field.name) entry.group = field.name;
    for (const a of ['min', 'max', 'step', 'pattern'] as const) {
      const v = field.getAttribute(a);
      if (v !== null && v !== '') entry[a] = v;
    }
    const minlength = field.getAttribute('minlength');
    const maxlength = field.getAttribute('maxlength');
    if (minlength) entry.minlength = Number(minlength);
    if (maxlength) entry.maxlength = Number(maxlength);
    if (ftag === 'select')
      entry.options = Array.from((field as HTMLSelectElement).options).map((o) => ({
        value: o.value,
        text: (o.textContent || '').replace(/\s+/g, ' ').trim(),
        disabled: o.disabled,
      }));
    out.push(entry);
  });
  return out;
}

/** Write the values into the form like a user would (native setters, input + change events). */
function writeForm(el: Element, values: { index: number; value: string | true }[]): number {
  const form = (el as HTMLButtonElement).form;
  if (!form) return 0;
  let written = 0;
  for (const { index, value } of values) {
    const field = form.elements[index] as
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (!field) continue;
    field.focus();
    if (value === true) {
      const box = field as HTMLInputElement;
      if (!box.checked) box.click();
    } else {
      const proto = Object.getPrototypeOf(field) as object;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(field, value);
      else field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    field.blur();
    written += 1;
  }
  return written;
}

/**
 * Fill the empty fields of the form `submit` belongs to. `inputs` are the persona's values by
 * field label (`trace_inputs`); everything else comes from {@link testValueFor}. Returns null when
 * `submit` is not a form's submit control (nothing is touched then).
 */
export async function autofillForm(
  submit: Locator,
  inputs: Readonly<Record<string, string>> = {},
): Promise<AutofillResult | null> {
  const fields = await evalOnElement(submit, readForm, undefined);
  if (fields === null) return null;
  const result: AutofillResult = { filled: [], skipped: [] };
  const plan: { index: number; value: TestValue }[] = [];
  const groups = new Set<string>();
  for (const f of fields) {
    if (f.group !== undefined) {
      if (groups.has(f.group)) continue;
      groups.add(f.group);
    }
    if (!f.empty) {
      result.skipped.push({ field: f.name, reason: 'already filled' });
      continue;
    }
    const value = testValueFor(f, inputs[f.label]);
    if (value === null) {
      result.skipped.push({
        field: f.name,
        reason: f.type === 'file' ? 'file input' : 'optional, left empty',
      });
      continue;
    }
    plan.push({ index: f.index, value });
    result.filled.push({ field: f.name, type: f.type, value: value === true ? 'checked' : value });
  }
  if (plan.length > 0) await evalOnElement(submit, writeForm, plan);
  return result;
}
