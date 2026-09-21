export type LocatorKind = 'role' | 'label' | 'text' | 'test_id' | 'container';

export interface RankedLocator {
  kind: LocatorKind;
  value: string;
  /** 0 = most stable. Order: role+name, label/text, test_id, container. */
  rank: number;
}

/** What the crawler knows about an element when it builds locators for it. */
export interface ElementFacts {
  role: string;
  /** Accessible name. */
  name: string | null;
  /** Form-control label text, when the element is labelled by a `<label>`. */
  label?: string | null;
  /** Visible text, when it differs from the accessible name or there is no name. */
  text?: string | null;
  /** Value of `data-testid` (or the configured test-id attribute). */
  testId?: string | null;
  /** Ancestor chain, outermost first, e.g. `['main', 'form "Logowanie"']`. */
  ancestors: readonly string[];
  /** Index among elements with the same role and name, for repeats. */
  nth?: number;
}

const FORM_CONTROLS = new Set([
  'textbox',
  'searchbox',
  'combobox',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'spinbutton',
  'listbox',
]);

const quote = (s: string): string => JSON.stringify(s);
const suffix = (nth: number | undefined): string => (nth && nth > 0 ? ` >> nth=${nth}` : '');

/**
 * Ranked candidate locators for one element (FR-013), most stable first:
 * 0. role + accessible name (`role=button[name="Zapłać"]`)
 * 1. label (form controls) or visible text
 * 2. `data-testid`: always included when the element exposes one
 * 3. container path: always present, so an element with no name still gets one candidate
 * The QA agent picks the first that resolves uniquely; the ranking is data, not a guarantee.
 */
export function buildLocators(el: ElementFacts): RankedLocator[] {
  const out: Omit<RankedLocator, 'rank'>[] = [];

  if (el.name)
    out.push({ kind: 'role', value: `role=${el.role}[name=${quote(el.name)}]${suffix(el.nth)}` });

  const label = el.label?.trim();
  const text = (el.text ?? (FORM_CONTROLS.has(el.role) ? null : el.name))?.trim();
  if (label && FORM_CONTROLS.has(el.role)) out.push({ kind: 'label', value: label });
  else if (text) out.push({ kind: 'text', value: text });

  if (el.testId) out.push({ kind: 'test_id', value: el.testId });

  const path = [...el.ancestors, el.name ? `${el.role} ${quote(el.name)}` : el.role].join(' > ');
  out.push({ kind: 'container', value: `${path}${suffix(el.nth)}` });

  return out.map((l, rank) => ({ ...l, rank }));
}
