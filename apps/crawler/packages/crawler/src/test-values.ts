/**
 * Deterministic test data for map-mode form autofill (spec 008 FR-002, research R9). Pure: the
 * same field always gets the same value, so two runs over one portal fill forms identically.
 * Values only need to pass the browser's own validation to reach the page behind the form; they
 * are obviously synthetic (test domains, round numbers).
 */

export interface AutofillField {
  /** Position in `form.elements`, used to write the value back. */
  index: number;
  tag: 'input' | 'select' | 'textarea';
  /** Lower-case input type (`text`, `email`, `number`, ...); `select` / `textarea` for those tags. */
  type: string;
  name: string;
  /** The visible label (label element, aria-label or placeholder), whitespace-collapsed. */
  label: string;
  required: boolean;
  /** True when the field holds no value (or a checkbox/radio is unchecked). */
  empty: boolean;
  /** Radio group name; one value per group. */
  group?: string;
  min?: string;
  max?: string;
  step?: string;
  minlength?: number;
  maxlength?: number;
  pattern?: string;
  options?: { value: string; text: string; disabled: boolean }[];
}

/** A value to write: text for inputs, an option value for selects, `true` to check. */
export type TestValue = string | true;

const PLACEHOLDER_OPTION = /wybierz|select|choose|^\s*[-—–]+|^\s*$/i;

/** Candidate strings tried, in order, against a field's `pattern`. */
const PATTERN_CANDIDATES = [
  'Test',
  'Testowy',
  '00-950',
  '12345',
  '123456789',
  '1234',
  '2000-01-01',
  'AB12345',
  'test@example.test',
  'WIOSNA10',
  'A',
  '1',
];

function fitsPattern(value: string, pattern: string): boolean {
  try {
    // The browser anchors `pattern` and uses the `v` flag; `u` is the closest portable choice.
    return new RegExp(`^(?:${pattern})$`, 'u').test(value);
  } catch {
    return false;
  }
}

function fitLength(value: string, minlength?: number, maxlength?: number): string {
  let v = value;
  if (minlength !== undefined && v.length < minlength) v = v.padEnd(minlength, 'x');
  if (maxlength !== undefined && maxlength > 0 && v.length > maxlength) v = v.slice(0, maxlength);
  return v;
}

function numberValue(min?: string, max?: string): string {
  const lo = min !== undefined && min !== '' ? Number(min) : undefined;
  const hi = max !== undefined && max !== '' ? Number(max) : undefined;
  let v = lo !== undefined && Number.isFinite(lo) ? lo : 1;
  if (hi !== undefined && Number.isFinite(hi) && v > hi) v = hi;
  return String(v);
}

function clampText(value: string, min?: string, max?: string): string {
  if (min && value < min) return min;
  if (max && value > max) return max;
  return value;
}

function textValue(f: AutofillField, preferred: string): string {
  if (f.pattern) {
    for (const c of [preferred, ...PATTERN_CANDIDATES]) {
      const v = fitLength(c, f.minlength, f.maxlength);
      if (fitsPattern(v, f.pattern)) return v;
    }
  }
  return fitLength(preferred, f.minlength, f.maxlength);
}

/**
 * The value for one field, or null to leave it alone. `override` is the persona's input for the
 * field's label (`trace_inputs`); for a select it names the option by its visible text or value.
 */
export function testValueFor(f: AutofillField, override?: string): TestValue | null {
  if (f.type === 'checkbox') return f.required && f.empty ? true : null;
  if (f.type === 'radio') return f.empty ? true : null;
  if (!f.empty) return null;
  if (f.tag === 'select') {
    const usable = (f.options ?? []).filter((o) => !o.disabled);
    if (override !== undefined) {
      const hit = usable.find((o) => o.text === override || o.value === override);
      if (hit) return hit.value;
    }
    const real = usable.find((o) => o.value !== '' && !PLACEHOLDER_OPTION.test(o.text));
    return real ? real.value : (usable.find((o) => o.value !== '')?.value ?? null);
  }
  if (override !== undefined) return override;
  switch (f.type) {
    case 'email':
      return fitLength('test@example.test', undefined, f.maxlength);
    case 'tel':
      return textValue(f, '500000000');
    case 'url':
      return 'https://example.test/';
    case 'number':
    case 'range':
      return numberValue(f.min, f.max);
    case 'date':
      return clampText('2000-01-01', f.min, f.max);
    case 'datetime-local':
      return clampText('2000-01-01T12:00', f.min, f.max);
    case 'month':
      return clampText('2000-01', f.min, f.max);
    case 'week':
      return clampText('2000-W01', f.min, f.max);
    case 'time':
      return clampText('12:00', f.min, f.max);
    case 'color':
      return '#336699';
    case 'password':
      return textValue(f, 'Test-Pass-1');
    case 'file':
    case 'hidden':
      return null;
    default:
      return textValue(f, f.tag === 'textarea' ? 'Test message, please ignore.' : 'Test');
  }
}
