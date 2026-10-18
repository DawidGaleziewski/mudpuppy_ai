/// <reference lib="dom" />
import type { FieldNameSource } from '@pathfinder/core';
import type { Frame, Page } from 'playwright';
import { evalWithHelpers } from './in-page.js';

export interface DomFormField {
  /**
   * The `name` attribute, else the `id`, when the control has one (existing data keeps its names).
   * A control with neither is named by its `label` text (label element, aria, placeholder, nearby
   * text) or, last, `field_<n>` (1-based position in the form).
   */
  name: string;
  type: string;
  required: boolean;
  constraints?: Record<string, string | number | boolean>;
  options?: string[];
  validation_messages?: string[];
  /** Where `name` came from (spec 015); see `FieldNameSource` in @pathfinder/core. */
  name_source?: FieldNameSource;
  /** The human-readable text found for the control (label, aria, placeholder or nearby text). */
  label?: string;
}

export interface DomForm {
  /** Accessible name used to join with the ARIA `form "<name>"` node; may be empty. */
  name: string;
  method: string;
  action: string;
  hasPassword: boolean;
  purpose: 'search' | 'other';
  fields: DomFormField[];
  /** Absent = `form` (spec 015). */
  kind?: 'form' | 'div_form';
  /** Frame path; absent for the top document. */
  frame?: string;
  /** Network call ids linked when the form's submit action ran. */
  submitted_via?: string[];
}

// In-page helpers: each is sent as source (evalWithHelpers), so none may close over module values.

function collapseText(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function ariaText(el: Element): string {
  const own = collapseText(el.getAttribute('aria-label'));
  if (own) return own;
  const ids = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
  return collapseText(ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' '));
}

function isControl(n: Node): boolean {
  return (
    n instanceof Element &&
    (/^(input|select|textarea|button)$/i.test(n.tagName) ||
      !!n.querySelector('input, select, textarea, button'))
  );
}

/** Text of the previous cell of the same table row, else the nearest preceding text (3 levels). */
function nearbyText(el: Element, form: Element): string {
  const cell = el.closest('td, th');
  const prevCell = cell && form.contains(cell) ? cell.previousElementSibling : null;
  if (prevCell && !isControl(prevCell)) {
    const t = collapseText(prevCell.textContent);
    if (t) return t;
  }
  let node: Element | null = el;
  for (let level = 0; level < 3 && node && node !== form; level++) {
    for (let sib = node.previousSibling; sib; sib = sib.previousSibling) {
      if (isControl(sib)) continue;
      const t = collapseText(sib.textContent);
      if (t) return t;
    }
    node = node.parentElement;
  }
  return '';
}

/** The first of label element, aria, placeholder, nearby text, with where it was found. */
function fieldLabel(el: Element, form: Element): { text: string; source: string } {
  const labelEl = (el as HTMLInputElement).labels?.[0];
  const placeholder = collapseText(el.getAttribute('placeholder'));
  // A placeholder without letters ("00-000", "__.__.____") shows a format, not what the field is:
  // the text next to the field names it better.
  const worded = /\p{L}/u.test(placeholder);
  const found: [string, string][] = [
    ['label', collapseText(labelEl?.textContent)],
    ['aria', ariaText(el)],
    ['placeholder', worded ? placeholder : ''],
  ];
  const hit = found.find(([, text]) => text);
  if (hit) return { text: hit[1], source: hit[0] };
  const near = nearbyText(el, form);
  if (near) return { text: near, source: 'nearby_text' };
  return placeholder ? { text: placeholder, source: 'placeholder' } : { text: '', source: '' };
}

function readConstraints(el: Element): Record<string, string | number | boolean> {
  const constraints: Record<string, string | number | boolean> = {};
  for (const a of ['minlength', 'maxlength', 'min', 'max', 'pattern', 'step', 'accept']) {
    const v = el.getAttribute(a);
    if (v !== null && v !== '')
      constraints[a] = /^-?\d+(\.\d+)?$/.test(v) && a !== 'pattern' ? Number(v) : v;
  }
  if ((el as HTMLInputElement).multiple) constraints.multiple = true;
  return constraints;
}

function describeField(el: Element, form: Element, position: number): DomFormField {
  const tag = el.tagName.toLowerCase();
  const input = el as HTMLInputElement;
  const constraints = readConstraints(el);
  (el as HTMLInputElement).checkValidity();
  const msg = (el as HTMLInputElement).validationMessage;
  const attr = el.getAttribute('name');
  const label = fieldLabel(el, form);
  const named = attr || el.id;
  const field: DomFormField = {
    name: named || label.text || `field_${position}`,
    type: tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : input.type || 'text',
    required: el.hasAttribute('required'),
    name_source: (attr ? 'name' : el.id ? 'id' : label.source || 'position') as FieldNameSource,
  };
  if (label.text) field.label = label.text;
  if (Object.keys(constraints).length) field.constraints = constraints;
  if (tag === 'select')
    field.options = [...(el as HTMLSelectElement).options]
      .slice(0, 50)
      .map((o) => (o.textContent ?? '').trim());
  if (msg) field.validation_messages = [msg];
  return field;
}

/** The name of a radio group: its fieldset's legend, else its radiogroup's accessible name. */
function groupLabel(el: Element): string {
  const legend = collapseText(el.closest('fieldset')?.querySelector('legend')?.textContent);
  if (legend) return legend;
  const group = el.closest('[role=radiogroup]');
  return group ? ariaText(group) : '';
}

/**
 * Radios of one `name` as one field (spec 036 FR-007, F-16@034): labelled by the group, each
 * radio's own label an option, required when any radio is. Other controls pass unchanged.
 */
function foldRadios(fields: DomFormField[], els: Element[]): DomFormField[] {
  const out: DomFormField[] = [];
  const groups = new Map<string, DomFormField>();
  els.forEach((el, i) => {
    const f = fields[i]!;
    const name = el.getAttribute('name');
    if ((el as HTMLInputElement).type !== 'radio' || !name) {
      out.push(f);
      return;
    }
    const option = f.label ?? (el as HTMLInputElement).value;
    const known = groups.get(name);
    if (known) {
      known.options!.push(option);
      known.required = known.required || f.required;
      known.validation_messages ??= f.validation_messages;
      return;
    }
    const field: DomFormField = { ...f, type: 'radio', options: [option] };
    const label = groupLabel(el);
    // The first radio's label names an option, not the group.
    if (label) field.label = label;
    else delete field.label;
    groups.set(name, field);
    out.push(field);
  });
  return out;
}

function formName(f: HTMLFormElement): string {
  const labelled = f.getAttribute('aria-labelledby');
  const fromLabelled = labelled
    ? labelled
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .join(' ')
        .trim()
    : '';
  return f.getAttribute('aria-label') ?? (fromLabelled || f.getAttribute('name') || f.id || '');
}

function readForm(f: HTMLFormElement): unknown {
  const SKIP = ['hidden', 'submit', 'button', 'image', 'reset'];
  const kept = ([...f.elements] as HTMLInputElement[]).filter((el) => {
    if (SKIP.includes(el.type ?? '')) return false;
    // Not rendered (`hidden`, `display: none`, a hidden ancestor): not a field of this state, so a
    // box shown only after a choice belongs to that state alone (spec 036 FR-003). A radio or
    // checkbox drawn by its visible label is still a field.
    if (
      el.getClientRects().length === 0 &&
      ![...(el.labels ?? [])].some((l) => l.getClientRects().length > 0)
    )
      return false;
    // Only real inputs may be nameless; fieldset/object/output stay as before (name or id).
    return /^(input|select|textarea)$/i.test(el.tagName) || !!(el.getAttribute('name') || el.id);
  });
  const isSearch =
    f.getAttribute('role') === 'search' ||
    !!f.querySelector('input[type=search]') ||
    !!f.closest('[role=search]');
  return {
    name: formName(f),
    method: (f.getAttribute('method') || 'get').toUpperCase(),
    action: f.action || '',
    hasPassword: !!f.querySelector('input[type=password]'),
    purpose: isSearch ? 'search' : 'other',
    fields: foldRadios(
      kept.map((el, i) => describeField(el, f, i + 1)),
      kept,
    ),
  };
}

/** A control that sends what was typed: a button, or a clickable whose text reads like a submit. */
function isSubmitLike(el: Element): boolean {
  if (el.matches('button, [type=submit], [type=button], [role=button]')) return true;
  const text = collapseText((el as HTMLElement).innerText);
  return (
    text.length > 0 &&
    text.length < 40 &&
    el.childElementCount <= 2 &&
    /^(wyślij|zapisz|wykonaj|dalej|zamów|zamawiam|potwierdź|kup|oblicz|szukaj|filtruj|zastosuj|submit|send|save|next|continue|order|confirm|apply|search)/i.test(
      text,
    )
  );
}

/**
 * The container a control outside any `<form>` belongs to: the nearest ancestor that also holds a
 * submit-like control (spec 015 R5), else the document body.
 */
function divFormContainer(el: Element): Element {
  for (let cur = el.parentElement; cur && cur !== document.body; cur = cur.parentElement)
    if ([...cur.querySelectorAll('*')].some((d) => d !== el && isSubmitLike(d))) return cur;
  return document.body;
}

/** Controls outside any `<form>` (React and other script-driven forms), one `div_form` per container. */
function readDivForms(): unknown[] {
  const SKIP = ['hidden', 'submit', 'button', 'image', 'reset'];
  const groups = new Map<Element, Element[]>();
  for (const el of document.querySelectorAll('input, select, textarea')) {
    if (el.closest('form') || SKIP.includes((el as HTMLInputElement).type ?? '')) continue;
    if (el.getClientRects().length === 0) continue;
    const box = divFormContainer(el);
    groups.set(box, [...(groups.get(box) ?? []), el]);
  }
  return [...groups].map(([box, els]) => {
    const heading = box.querySelector('h1, h2, h3, h4, legend');
    return {
      name: ariaText(box) || collapseText(heading?.textContent),
      method: '',
      action: '',
      hasPassword: els.some((e) => (e as HTMLInputElement).type === 'password'),
      purpose:
        els.some((e) => (e as HTMLInputElement).type === 'search') || !!box.closest('[role=search]')
          ? 'search'
          : 'other',
      fields: foldRadios(
        els.map((el, i) => describeField(el, box, i + 1)),
        els,
      ),
      kind: 'div_form',
    };
  });
}

/**
 * Extract forms and their field schemas without submitting or reading any value: only attributes,
 * option labels and the browser's own validation message are read. `checkValidity()` fires
 * `invalid` events but never submits. (Observation never submits; since spec 008 map mode may
 * submit a form as an action, within the run's limit, superseding spec 001 FR-011.)
 *
 * Controls without `name`/`id` are kept (spec 015 FR-007), named by label, aria, placeholder,
 * nearby text or position, with `name_source` saying which. Controls outside any `<form>` are
 * recorded as `div_form`s, one per container (FR-008), after the real forms.
 */
export function extractForms(page: Page | Frame): Promise<DomForm[]> {
  return evalWithHelpers(
    page,
    [
      collapseText,
      ariaText,
      isControl,
      nearbyText,
      fieldLabel,
      readConstraints,
      describeField,
      groupLabel,
      foldRadios,
      formName,
      readForm,
      isSubmitLike,
      divFormContainer,
      readDivForms,
    ],
    () =>
      [
        ...[...document.querySelectorAll('form')].map((f) => readForm(f)),
        ...readDivForms(),
      ] as DomForm[],
  );
}
