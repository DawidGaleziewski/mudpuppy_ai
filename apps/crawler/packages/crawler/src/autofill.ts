/// <reference lib="dom" />
import type { Locator } from 'playwright';
import { evalOnElementWithHelpers } from './in-page.js';
import { testValueFor, type AutofillField, type TestValue } from './test-values.js';

/**
 * Map-mode form autofill (spec 008 FR-002, research R9): before map mode presses a control that
 * submits a form, the form's empty fields are filled with test data, so the crawl reaches the page
 * behind the form instead of the browser's validation message. On every environment, within the
 * run's action limit when one is set (spec 021).
 */

/** `field` (not `name`): the decision log redacts values under a `name` key as personal data. */
export interface AutofillResult {
  /** `label`: the visible label, so a run can repeat the fill by label (spec 032 suites). */
  filled: { field: string; type: string; value: string; label: string }[];
  skipped: { field: string; reason: string }[];
}

/**
 * The controls a click on `el` sends: a native submit's form; for a script-driven submit (a `div` or
 * `type=button` whose text reads like a submit, spec 015) its `<form>`, else the nearest container
 * with controls outside any form (a `div` form). Null when the click submits nothing. `named`: the
 * caller chose the control as a step's submit (a form probe, spec 032 F-18), so its text need not
 * read like a submit ("Zastosuj", "Dodaj do koszyka").
 */
function pfNativeSubmitForm(el: Element): HTMLFormElement | null {
  const form = (el as HTMLButtonElement).form;
  if (!form) return null;
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute('type') || (tag === 'button' ? 'submit' : '')).toLowerCase();
  const submits =
    (tag === 'button' && type === 'submit') ||
    (tag === 'input' && (type === 'submit' || type === 'image'));
  return submits ? form : null;
}

function pfControlsFor(el: Element, named?: boolean): Element[] | null {
  const native = pfNativeSubmitForm(el);
  if (native) return Array.from(native.elements);
  const text = ((el as HTMLElement).innerText || el.getAttribute('aria-label') || '')
    .replace(/\s+/g, ' ')
    .trim();
  const submitWord =
    /^(wyślij|zapisz|wykonaj|dalej|zamów|zamawiam|potwierdź|oblicz|submit|send|save|next|continue|order|confirm)/i;
  if (!named && (text.length > 40 || !submitWord.test(text))) return null;
  const form = el.closest('form');
  if (form) return Array.from(form.elements);
  for (let cur = el.parentElement; cur; cur = cur.parentElement) {
    const controls = [...cur.querySelectorAll('input, select, textarea')].filter(
      (c) => !c.closest('form'),
    );
    if (controls.length > 0) return controls;
  }
  return null;
}

/**
 * A `<label>` not tied to the field (no `for`, field not inside it) but alone with it in its
 * wrapper (`<div><label>Kod pocztowy</label><input></div>`), as React and legacy markup often do
 * (spec 031 T012: the shop's checkout fields had no label for autofill).
 */
function pfNearLabel(field: Element): HTMLLabelElement | null {
  const wrap = field.parentElement;
  if (!wrap) return null;
  const labels = wrap.querySelectorAll(':scope > label');
  const controls = wrap.querySelectorAll(':scope > input, :scope > select, :scope > textarea');
  if (labels.length !== 1 || controls.length !== 1) return null;
  const l = labels[0] as HTMLLabelElement;
  return l.htmlFor || l.contains(field) ? null : l;
}

/** In-page helpers sent with `readForm` / `writeForm`. */
const HELPERS = [pfNativeSubmitForm, pfControlsFor, pfNearLabel];

/** The submit control's form fields, or null when the control does not submit a form. */
function readForm(el: Element, named?: boolean): AutofillField[] | null {
  const controls = pfControlsFor(el, named);
  if (controls === null) return null;
  const skip = ['hidden', 'submit', 'button', 'image', 'reset'];
  const out: AutofillField[] = [];
  const checkedGroups = new Set<string>();
  for (const f of controls) {
    const input = f as HTMLInputElement;
    if (input.type === 'radio' && input.checked) checkedGroups.add(input.name);
  }
  controls.forEach((f, index) => {
    const field = f as HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement;
    const ftag = field.tagName.toLowerCase();
    if (ftag !== 'input' && ftag !== 'select' && ftag !== 'textarea') return;
    const ftype = ftag === 'input' ? (field.type || 'text').toLowerCase() : ftag;
    if (skip.includes(ftype) || field.disabled || field.readOnly) return;
    const labelEl = (field.labels && field.labels[0]) || pfNearLabel(field);
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
      tag: ftag,
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
    for (const a of ['min', 'max', 'step', 'pattern', 'placeholder', 'autocomplete'] as const) {
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

/**
 * Write the values into the form like a user would (native setters, input + change events). `true`
 * checks a box or radio; `false` unchecks it (form probes, spec 032: a radio cannot be unclicked,
 * so it is cleared with a change event).
 */
function writeForm(
  el: Element,
  arg: { values: { index: number; value: string | boolean }[]; named?: boolean },
): number {
  const { values, named } = arg;
  const controls = pfControlsFor(el, named);
  if (!controls) return 0;
  let written = 0;
  for (const { index, value } of values) {
    const field = controls[index] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (!field) continue;
    field.focus();
    if (value === true) {
      const box = field as HTMLInputElement;
      if (!box.checked) box.click();
    } else if (value === false) {
      const box = field as HTMLInputElement;
      if (box.type === 'checkbox' && box.checked) box.click();
      else if (box.checked) {
        box.checked = false;
        box.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      const proto = Object.getPrototypeOf(field) as object;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- called with `.call(field, …)` below
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
 * field label (`test_data`); everything else comes from {@link testValueFor}. Returns null when
 * `submit` is not a form's submit control (nothing is touched then).
 */
export async function autofillForm(
  submit: Locator,
  inputs: Readonly<Record<string, string>> = {},
): Promise<AutofillResult | null> {
  const fields = await evalOnElementWithHelpers(submit, HELPERS, readForm, undefined);
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
    result.filled.push({
      field: f.name,
      type: f.type,
      value: value === true ? 'checked' : value,
      label: f.label,
    });
  }
  if (plan.length > 0) await evalOnElementWithHelpers(submit, HELPERS, writeForm, { values: plan });
  return result;
}

/**
 * The fields of the form `submit` belongs to (form probes, spec 032); null when it submits none.
 * The probe named `submit` as the step's control, so any text counts as a submit (F-18).
 */
export function readFormFields(submit: Locator): Promise<AutofillField[] | null> {
  return evalOnElementWithHelpers(submit, HELPERS, readForm, true);
}

/** Write values into the form `submit` belongs to, by field index; `false` unchecks. */
export function writeFormFields(
  submit: Locator,
  values: { index: number; value: string | boolean }[],
): Promise<number> {
  return evalOnElementWithHelpers(submit, HELPERS, writeForm, { values, named: true });
}

/**
 * The browser's own constraint messages of the form's invalid fields (`validationMessage`), read
 * after a refused submit: they never appear in the DOM or the ARIA snapshot (spec 032 research).
 * A form with `novalidate` shows none.
 */
function readNativeMessages(el: Element): { field: string | null; text: string }[] {
  const form = (el as HTMLButtonElement).form ?? el.closest('form');
  if (form?.noValidate) return [];
  const controls = pfControlsFor(el, true) ?? [];
  const out: { field: string | null; text: string }[] = [];
  for (const c of controls) {
    const f = c as HTMLInputElement;
    if (typeof f.checkValidity !== 'function' || f.checkValidity() || !f.validationMessage)
      continue;
    const labelEl = (f.labels && f.labels[0]) || pfNearLabel(f);
    // Named like `readForm` names the field, so a message pairs with the probe's target.
    const names = [
      labelEl ? labelEl.textContent : null,
      f.getAttribute('aria-label'),
      f.getAttribute('placeholder'),
    ];
    const label = (names.find((n) => n) ?? '').replace(/\s+/g, ' ').trim();
    out.push({ field: label || null, text: f.validationMessage });
  }
  return out;
}

export function nativeMessages(submit: Locator): Promise<{ field: string | null; text: string }[]> {
  return evalOnElementWithHelpers(submit, HELPERS, readNativeMessages, undefined);
}
