// Validation probes (spec 032 US2.1, design 11-map-runs §3.3): leave fields empty, type the wrong
// format, cross a boundary. Each try changes only what it is about; every other field keeps its
// happy-path value, so the message that appears belongs to that change.

import {
  clear,
  controls,
  defineProbe,
  nameOf,
  type ProbeContext,
  type ProbeField,
  type ProbeTry,
} from '../define.js';

const typed = (f: ProbeField): boolean =>
  f.tag !== 'select' && f.type !== 'checkbox' && f.type !== 'radio';

const tryOf = (
  probe: string,
  f: ProbeField | null,
  writes: ProbeTry['writes'],
  summary: string,
): ProbeTry => ({
  key: f === null ? probe : `${probe}:${nameOf(f)}`,
  probe,
  group: 'validation',
  target: f === null ? null : nameOf(f),
  writes,
  summary,
});

export const requiredEmptyAll = defineProbe({
  id: 'required-empty-all',
  group: 'validation',
  summary: 'Submit with every required field empty',
  scars: ['SC-19'],
  tries: ({ fields }: ProbeContext) => {
    const required = controls(fields).filter((f) => f.required);
    if (required.length === 0) return [];
    return [
      tryOf(
        'required-empty-all',
        null,
        required.flatMap((f) => clear(fields, f)),
        `leave all ${required.length} required fields empty`,
      ),
    ];
  },
});

export const requiredEmptyOne = defineProbe({
  id: 'required-empty-one',
  group: 'validation',
  summary: 'Each required field empty, one at a time',
  scars: ['SC-19'],
  tries: ({ fields }: ProbeContext) =>
    controls(fields)
      .filter((f) => f.required)
      .map((f) => tryOf('required-empty-one', f, clear(fields, f), `leave "${nameOf(f)}" empty`)),
});

/** A value of the wrong shape for the field's type, pattern or format mask; null when none is known. */
export function wrongValue(f: ProbeField): string | null {
  switch (f.type) {
    case 'email':
      return 'not-an-address';
    case 'number':
    case 'range':
      return 'abc';
    case 'tel':
      return 'phone';
    case 'url':
      return 'not a url';
    case 'date':
      return 'yesterday';
  }
  if (f.pattern) return '?';
  if (
    f.placeholder &&
    /^[\dDMYRJ.\-/ ]+$/i.test(f.placeholder.trim()) &&
    /\d|[DMY]{2}/i.test(f.placeholder)
  )
    return 'wrong';
  return null;
}

export const wrongFormat = defineProbe({
  id: 'wrong-format',
  group: 'validation',
  summary: 'The wrong format per typed field (e-mail, number, date, phone, pattern, format mask)',
  scars: ['SC-19'],
  tries: ({ fields }: ProbeContext) =>
    controls(fields)
      .filter(typed)
      .flatMap((f) => {
        const v = wrongValue(f);
        return v === null
          ? []
          : [
              tryOf(
                'wrong-format',
                f,
                [{ index: f.index, value: v }],
                `type "${v}" into "${nameOf(f)}"`,
              ),
            ];
      }),
});

export const boundaries = defineProbe({
  id: 'boundary',
  group: 'validation',
  summary: 'Boundaries: one below the minimum, one above the maximum',
  scars: ['SC-19'],
  tries: ({ fields }: ProbeContext) =>
    controls(fields)
      .filter(typed)
      .flatMap((f) => {
        // No "maxlength + 1": the browser stops a person typing at the limit, and a value written
        // by script gets past it unflagged, so the try would report a false "accepted" (F-06@032).
        const out: ProbeTry[] = [];
        for (const [side, raw, delta] of [
          ['min', f.min, -1],
          ['max', f.max, 1],
        ] as const) {
          const n = raw === undefined ? NaN : Number(raw);
          if (!Number.isFinite(n)) continue;
          const v = String(n + delta);
          out.push({
            ...tryOf(
              'boundary',
              f,
              [{ index: f.index, value: v }],
              `type ${v} into "${nameOf(f)}" (${side} ${raw})`,
            ),
            key: `boundary:${nameOf(f)}:${side}`,
          });
        }
        return out;
      }),
});

export const optionalEmpty = defineProbe({
  id: 'optional-empty',
  group: 'validation',
  summary: 'Submit with the optional fields left empty (optional with and without)',
  scars: ['SC-19'],
  tries: ({ fields, base }: ProbeContext) => {
    const optional = controls(fields).filter(
      (f) => !f.required && base.has(f.index) && f.type !== 'radio',
    );
    if (optional.length === 0) return [];
    return [
      tryOf(
        'optional-empty',
        null,
        optional.flatMap((f) => clear(fields, f)),
        `leave the ${optional.length} optional field(s) empty`,
      ),
    ];
  },
});
