// SC-18's fields and validators, shared by the server (re-validation) and the page script (the same
// rules, serialised into it), so both show the same messages.

export type Step = 1 | 2 | 3;
export type Values = Record<string, string>;

export interface Field {
  name: string;
  label: string;
  kind: 'text' | 'select' | 'checkbox';
  placeholder?: string;
  options?: string[];
  /** Ordered rules: the first that fails gives the message. */
  rules: Rule[];
}

/**
 * A rule's test over `v` (the field value) and `all` (every value). The server calls it; the page
 * gets its source (`toString()`), so it must use nothing but its arguments and built-ins.
 */
export interface Rule {
  test: (v: string, all: Values) => boolean;
  message: string;
}

/** The fields of each step, with their rules in order. */
export const FIELDS: Record<Step, Field[]> = {
  1: [
    {
      name: 'fullname',
      label: 'Full name',
      kind: 'text',
      rules: [
        { test: (v) => v.trim() !== '', message: 'Full name is required.' },
        { test: (v) => v.trim().length >= 2, message: 'Full name must have at least 2 characters.' },
      ],
    },
    {
      name: 'email',
      label: 'E-mail',
      kind: 'text',
      placeholder: 'name@example.test',
      rules: [
        { test: (v) => v.trim() !== '', message: 'E-mail is required.' },
        {
          test: (v) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v),
          message: 'Enter a valid e-mail address.',
        },
      ],
    },
    {
      name: 'birthyear',
      label: 'Year of birth',
      kind: 'text',
      placeholder: 'YYYY',
      rules: [
        { test: (v) => v.trim() !== '', message: 'Year of birth is required.' },
        { test: (v) => /^\d{4}$/.test(v), message: 'Enter the year with four digits.' },
        { test: (v) => Number(v) <= 2008, message: 'You must be at least 18 years old.' },
      ],
    },
  ],
  2: [
    {
      name: 'product',
      label: 'Product',
      kind: 'select',
      options: ['Household insurance', 'Liability insurance'],
      rules: [{ test: (v) => v !== '', message: 'Choose a product.' }],
    },
    {
      name: 'startyear',
      label: 'Start year',
      kind: 'text',
      placeholder: 'YYYY',
      rules: [
        { test: (v) => /^\d{4}$/.test(v), message: 'Enter the start year with four digits.' },
        {
          test: (v, all) => Number(v) >= Number(all.birthyear) + 18,
          message: 'The contract cannot start before you are 18.',
        },
      ],
    },
    {
      name: 'customer',
      label: 'Customer number',
      kind: 'text',
      placeholder: 'KD-000000',
      rules: [
        { test: (v) => v.trim() !== '', message: 'Customer number is required.' },
        { test: (v) => /^KD-\d{6}$/.test(v), message: 'The customer number looks like KD-123456.' },
      ],
    },
    {
      name: 'terms',
      label: 'I accept the terms',
      kind: 'checkbox',
      rules: [{ test: (v) => v === 'yes', message: 'You must accept the terms.' }],
    },
  ],
  3: [
    {
      name: 'confirm',
      label: 'I confirm the data is correct',
      kind: 'checkbox',
      rules: [{ test: (v) => v === 'yes', message: 'Confirm the data to submit.' }],
    },
  ],
};

/** The first failing rule's message per field of a step; empty when the step is valid. */
export function validate(step: Step, all: Values): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of FIELDS[step]) {
    const v = all[f.name] ?? '';
    for (const r of f.rules) {
      if (!r.test(v, all)) {
        errors[f.name] = r.message;
        break;
      }
    }
  }
  return errors;
}
