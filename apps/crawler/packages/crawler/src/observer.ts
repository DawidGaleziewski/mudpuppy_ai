/// <reference lib="dom" />
import type { Page } from 'playwright';

export interface DomFormField {
  name: string;
  type: string;
  required: boolean;
  constraints?: Record<string, string | number | boolean>;
  options?: string[];
  validation_messages?: string[];
}

export interface DomForm {
  /** Accessible name used to join with the ARIA `form "<name>"` node; may be empty. */
  name: string;
  method: string;
  action: string;
  hasPassword: boolean;
  purpose: 'search' | 'other';
  fields: DomFormField[];
}

/** ARIA snapshot of the whole page (no screenshots in v1: regex masking cannot redact pixels). */
export function captureAria(page: Page): Promise<string> {
  return page.locator('body').ariaSnapshot();
}

/**
 * Extract forms and their field schemas WITHOUT submitting or reading any value (FR-011): only
 * attributes, option labels and the browser's own validation message are read. `checkValidity()`
 * fires `invalid` events but never submits.
 *
 * The callbacks passed to `page.evaluate` must not bind functions to names (`const f = () => ...`):
 * the MCP server runs under tsx, whose keepNames transform wraps them in a `__name(...)` helper that
 * does not exist in the page, so the evaluate throws `__name is not defined`.
 */
export function extractForms(page: Page): Promise<DomForm[]> {
  return page.evaluate(() => {
    const SKIP = new Set(['hidden', 'submit', 'button', 'image', 'reset']);
    return [...document.querySelectorAll('form')].map((f) => {
      const labelled = f.getAttribute('aria-labelledby');
      const fromLabelled = labelled
        ? labelled
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
            .join(' ')
            .trim()
        : '';
      const fields = (
        [...f.elements] as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[]
      )
        .filter(
          (el) =>
            (el.getAttribute('name') || el.id) && !SKIP.has((el as HTMLInputElement).type ?? ''),
        )
        .map((el) => {
          const tag = el.tagName.toLowerCase();
          const input = el as HTMLInputElement;
          const constraints: Record<string, string | number | boolean> = {};
          for (const a of ['minlength', 'maxlength', 'min', 'max', 'pattern', 'step', 'accept']) {
            const v = el.getAttribute(a);
            if (v !== null && v !== '')
              constraints[a] = /^-?\d+(\.\d+)?$/.test(v) && a !== 'pattern' ? Number(v) : v;
          }
          if (input.multiple) constraints.multiple = true;
          el.checkValidity();
          const msg = el.validationMessage;
          const field: DomFormField = {
            name: el.getAttribute('name') || el.id,
            type:
              tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : input.type || 'text',
            required: el.hasAttribute('required'),
          };
          if (Object.keys(constraints).length) field.constraints = constraints;
          if (tag === 'select')
            field.options = [...(el as HTMLSelectElement).options]
              .slice(0, 50)
              .map((o) => (o.textContent ?? '').trim());
          if (msg) field.validation_messages = [msg];
          return field;
        });
      const isSearch =
        f.getAttribute('role') === 'search' ||
        !!f.querySelector('input[type=search]') ||
        !!f.closest('[role=search]');
      return {
        name:
          f.getAttribute('aria-label') ?? (fromLabelled || f.getAttribute('name') || f.id || ''),
        method: (f.getAttribute('method') || 'get').toUpperCase(),
        action: f.action || '',
        hasPassword: !!f.querySelector('input[type=password]'),
        purpose: (isSearch ? 'search' : 'other') as 'search' | 'other',
        fields,
      };
    });
  });
}

export interface DomTestId {
  testId: string;
  role: string;
  /** Approximate accessible name (aria-label, else visible text), whitespace-collapsed. */
  name: string;
  /** Text of an associated <label>, for form controls. */
  label: string;
}

/** Elements exposing `data-testid`, with the role and name needed to join them to ARIA candidates. */
export function extractTestIds(page: Page): Promise<DomTestId[]> {
  return page.evaluate(() => {
    const IMPLICIT: Record<string, string> = {
      a: 'link',
      button: 'button',
      select: 'combobox',
      textarea: 'textbox',
      h1: 'heading',
      h2: 'heading',
      h3: 'heading',
    };
    const INPUT: Record<string, string> = {
      checkbox: 'checkbox',
      radio: 'radio',
      search: 'searchbox',
      button: 'button',
      submit: 'button',
      range: 'slider',
      number: 'spinbutton',
    };
    return [...document.querySelectorAll('[data-testid]')].slice(0, 500).map((el) => {
      const tag = el.tagName.toLowerCase();
      const type = (el as HTMLInputElement).type;
      const role =
        el.getAttribute('role') ??
        (tag === 'input' ? (INPUT[type] ?? 'textbox') : (IMPLICIT[tag] ?? 'generic'));
      // Whitespace-collapsed, in order: label, aria-label, text, title, placeholder.
      const [label, ariaLabel, text, title, placeholder] = [
        (el as HTMLInputElement).labels?.[0]?.textContent,
        el.getAttribute('aria-label'),
        el.textContent,
        el.getAttribute('title'),
        el.getAttribute('placeholder'),
      ].map((s) => (s ?? '').replace(/\s+/g, ' ').trim()) as [
        string,
        string,
        string,
        string,
        string,
      ];
      const name = ariaLabel || label || text || title || placeholder;
      return {
        testId: el.getAttribute('data-testid') ?? '',
        role,
        name: name.slice(0, 200),
        label: label.slice(0, 200),
      };
    });
  });
}

export interface PageObservation {
  url: string;
  title: string;
  ariaSnapshot: string;
  forms: DomForm[];
  testIds: DomTestId[];
}

export async function observePage(page: Page): Promise<PageObservation> {
  const [ariaSnapshot, forms, title, testIds] = await Promise.all([
    captureAria(page),
    extractForms(page),
    page.title(),
    extractTestIds(page),
  ]);
  return { url: page.url(), title, ariaSnapshot, forms, testIds };
}
